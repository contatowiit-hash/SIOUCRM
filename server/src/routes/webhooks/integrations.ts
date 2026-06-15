import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { orders, paymentConnections, pdvConnections } from '../../db/schema.js';
import { env } from '../../env.js';
import { normalizeMercadoPagoPayment, verifyMercadoPagoSignature } from '../../integrations/payments/mercado_pago/adapter.js';
import { getMercadoPagoPayment } from '../../integrations/payments/mercado_pago/client.js';
import { pdvAdapters, pdvProviders, type PdvProvider } from '../../integrations/pdv/index.js';
import { upsertNormalizedTransaction } from '../../services/transactions.js';
import { decryptIntegrationSecret } from '../../utils/integrationCrypto.js';
import { safeEqual } from '../../utils/security.js';
import {
  getRemainingProviderConfig,
  remainingPaymentAdapters,
  remainingPaymentProviders,
  type RemainingPaymentProvider,
} from '../../integrations/payments/index.js';
import { getGenericPaymentIdentity } from '../../integrations/payments/shared/generic-adapter.js';
import { finishRawIntegrationEvent, saveRawIntegrationEvent } from '../../services/integrationWebhookEvents.js';
import { verifyPagBankAuthenticity, normalizeOfficialPagBankPayment } from '../../integrations/payments/pagbank/official-adapter.js';
import { checkInfinitePayPayment } from '../../integrations/payments/infinitepay/client.js';

const getHeader = (request: FastifyRequest, name: string) => {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const getProviderToken = (request: FastifyRequest) => {
  const direct = getHeader(request, 'x-integration-token') || getHeader(request, 'x-provider-token');
  if (direct) return direct;
  const authorization = getHeader(request, 'authorization');
  return authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
};

const getNestedString = (source: unknown, path: string[]) => {
  let current = source;
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' || typeof current === 'number' ? String(current) : null;
};

const getRawBody = (request: FastifyRequest) =>
  (request as FastifyRequest & { rawBody?: string }).rawBody ?? JSON.stringify(request.body ?? {});

const infinitePayWebhookSchema = z.object({
  order_nsu: z.string().uuid(),
  transaction_nsu: z.string().min(1).max(300),
  invoice_slug: z.string().min(1).max(300),
  amount: z.coerce.number().nonnegative().optional(),
});

const getObjectString = (value: unknown, key: string) =>
  value && typeof value === 'object' && typeof (value as Record<string, unknown>)[key] === 'string'
    ? String((value as Record<string, unknown>)[key])
    : null;

export const integrationWebhookRoutes = async (app: FastifyInstance) => {
  app.post('/webhooks/pdv/:provider/:connectionId', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { provider, connectionId } = request.params as { provider: string; connectionId: string };
    if (!pdvProviders.includes(provider as PdvProvider)) return reply.code(404).send({ error: 'Not found' });
    const [connection] = await db
      .select()
      .from(pdvConnections)
      .where(and(eq(pdvConnections.id, connectionId), eq(pdvConnections.provider, provider), eq(pdvConnections.status, 'connected')))
      .limit(1);
    if (!connection?.integrationToken) return reply.code(404).send({ error: 'Not found' });
    try {
      const receivedToken = getProviderToken(request);
      const expectedToken = decryptIntegrationSecret(connection.integrationToken);
      if (!receivedToken || !safeEqual(receivedToken, expectedToken)) return reply.code(401).send({ error: 'Unauthorized' });
      const transaction = pdvAdapters[provider as PdvProvider](request.body, connection.restaurantId);
      await upsertNormalizedTransaction(transaction);
      await db.update(pdvConnections).set({ lastEventAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(pdvConnections.id, connection.id));
      request.log.info({ provider, restaurantId: connection.restaurantId, externalSaleId: transaction.externalSaleId, result: 'ok' }, 'pdv event processed');
      return { received: true };
    } catch (error) {
      await db.update(pdvConnections).set({ status: 'error', lastError: 'Não foi possível ler a última venda recebida.', updatedAt: new Date() }).where(eq(pdvConnections.id, connection.id));
      request.log.error({ err: error, provider, restaurantId: connection.restaurantId }, 'pdv event failed');
      return reply.code(422).send({ error: 'Evento inválido.' });
    }
  });

  app.post('/webhooks/payments/:provider', { config: { rateLimit: { max: 180, timeWindow: '1 minute' } } }, async (request, reply) => {
    const provider = (request.params as { provider: string }).provider;
    if (provider === 'pagbank') {
      const referenceId = getObjectString(request.body, 'reference_id');
      if (!referenceId) return reply.code(422).send({ error: 'Evento inválido.' });
      const [order] = await db.select().from(orders).where(eq(orders.id, referenceId)).limit(1);
      if (!order) return reply.code(200).send({ received: true });
      const [connection] = await db
        .select()
        .from(paymentConnections)
        .where(
          and(
            eq(paymentConnections.restaurantId, order.restaurantId),
            eq(paymentConnections.provider, 'pagbank'),
            eq(paymentConnections.status, 'connected'),
          ),
        )
        .limit(1);
      if (
        !connection?.accessToken ||
        !verifyPagBankAuthenticity(
          getRawBody(request),
          getHeader(request, 'x-authenticity-token'),
          decryptIntegrationSecret(connection.accessToken),
        )
      ) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      const rawEventId = await saveRawIntegrationEvent({
        restaurantId: order.restaurantId,
        paymentConnectionId: connection.id,
        provider,
        eventType: getObjectString(request.body, 'type'),
        providerEventId: getObjectString(request.body, 'id'),
        payload: request.body,
      });
      try {
        const transaction = normalizeOfficialPagBankPayment(request.body, order.restaurantId);
        if (Math.abs(transaction.totalAmount - Number(order.totalAmount)) > 0.01) throw new Error('PagBank amount mismatch');
        await upsertNormalizedTransaction(transaction);
        await db
          .update(orders)
          .set({ paymentStatus: transaction.paymentStatus, pixChargeId: transaction.pixChargeId ?? null, updatedAt: new Date() })
          .where(and(eq(orders.id, order.id), eq(orders.restaurantId, order.restaurantId)));
        await finishRawIntegrationEvent(rawEventId, 'processed');
        await db.update(paymentConnections).set({ lastEventAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(paymentConnections.id, connection.id));
      } catch (error) {
        await finishRawIntegrationEvent(rawEventId, 'failed', 'Não foi possível confirmar o pagamento recebido.');
        request.log.error({ err: error, provider, restaurantId: order.restaurantId }, 'payment event failed');
      }
      return reply.code(200).send({ received: true });
    }

    if (provider === 'infinitepay') {
      const parsed = infinitePayWebhookSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(422).send({ error: 'Evento inválido.' });
      const [order] = await db.select().from(orders).where(eq(orders.id, parsed.data.order_nsu)).limit(1);
      if (!order) return reply.code(200).send({ received: true });
      const [connection] = await db
        .select()
        .from(paymentConnections)
        .where(
          and(
            eq(paymentConnections.restaurantId, order.restaurantId),
            eq(paymentConnections.provider, 'infinitepay'),
            eq(paymentConnections.status, 'connected'),
          ),
        )
        .limit(1);
      if (!connection?.externalAccountId) return reply.code(200).send({ received: true });
      const rawEventId = await saveRawIntegrationEvent({
        restaurantId: order.restaurantId,
        paymentConnectionId: connection.id,
        provider,
        eventType: 'payment',
        providerEventId: parsed.data.transaction_nsu,
        payload: request.body,
      });
      try {
        const check = await checkInfinitePayPayment({
          handle: connection.externalAccountId,
          orderId: order.id,
          transactionNsu: parsed.data.transaction_nsu,
          slug: parsed.data.invoice_slug,
        });
        const status = check.status?.toLowerCase() ?? '';
        const paid = check.paid === true || ['paid', 'approved', 'completed'].includes(status);
        const reportedAmount = check.paid_amount ?? check.amount;
        if (reportedAmount != null && Math.abs(reportedAmount / 100 - Number(order.totalAmount)) > 0.01) {
          throw new Error('InfinitePay amount mismatch');
        }
        await upsertNormalizedTransaction({
          externalSaleId: parsed.data.transaction_nsu,
          orderId: order.id,
          restaurantId: order.restaurantId,
          totalAmount: Number(order.totalAmount),
          source: 'infinitepay',
          paymentMethod: 'unknown',
          paymentStatus: paid ? 'paid' : 'pending',
          createdAt: new Date().toISOString(),
        });
        await db
          .update(orders)
          .set({ paymentStatus: paid ? 'paid' : 'pending', updatedAt: new Date() })
          .where(and(eq(orders.id, order.id), eq(orders.restaurantId, order.restaurantId)));
        await finishRawIntegrationEvent(rawEventId, 'processed');
        await db.update(paymentConnections).set({ lastEventAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(paymentConnections.id, connection.id));
      } catch (error) {
        await finishRawIntegrationEvent(rawEventId, 'failed', 'Não foi possível confirmar o pagamento recebido.');
        request.log.error({ err: error, provider, restaurantId: order.restaurantId }, 'payment event failed');
        return reply.code(422).send({ error: 'Evento inválido.' });
      }
      return reply.code(200).send({ received: true });
    }

    if (remainingPaymentProviders.includes(provider as RemainingPaymentProvider)) {
      const typedProvider = provider as RemainingPaymentProvider;
      const config = getRemainingProviderConfig(typedProvider);
      const adapter = remainingPaymentAdapters[typedProvider];
      const signature = getHeader(request, 'x-webhook-signature') ?? getHeader(request, 'x-signature');
      const connectionId = getNestedString(request.query, ['connection_id']);
      const [directConnection] =
        connectionId && (typedProvider === 'cielo' || typedProvider === 'getnet')
          ? await db
              .select()
              .from(paymentConnections)
              .where(
                and(
                  eq(paymentConnections.id, connectionId),
                  eq(paymentConnections.provider, typedProvider),
                  eq(paymentConnections.status, 'connected'),
                ),
              )
              .limit(1)
          : [];
      const ownWebhookSecret =
        directConnection && typedProvider === 'cielo' && directConnection.accessToken
          ? decryptIntegrationSecret(directConnection.accessToken)
          : directConnection && typedProvider === 'getnet' && directConnection.refreshToken
            ? decryptIntegrationSecret(directConnection.refreshToken)
            : undefined;
      const webhookSecret = ownWebhookSecret ?? config.webhookSecret;
      if (!webhookSecret || !adapter.verify(getRawBody(request), signature, webhookSecret)) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      let identity: ReturnType<typeof getGenericPaymentIdentity>;
      try {
        identity = getGenericPaymentIdentity(request.body);
      } catch {
        return reply.code(422).send({ error: 'Evento inválido.' });
      }
      if (!identity.externalAccountId) return reply.code(200).send({ received: true });

      const [connection] = directConnection
        ? [directConnection]
        : await db
            .select()
            .from(paymentConnections)
            .where(
              and(
                eq(paymentConnections.provider, typedProvider),
                eq(paymentConnections.externalAccountId, identity.externalAccountId),
                eq(paymentConnections.status, 'connected'),
              ),
            )
            .limit(1);
      if (!connection) return reply.code(200).send({ received: true });

      const rawEventId = await saveRawIntegrationEvent({
        restaurantId: connection.restaurantId,
        paymentConnectionId: connection.id,
        provider: typedProvider,
        eventType: identity.eventType,
        providerEventId: identity.providerEventId,
        payload: request.body,
      });

      try {
        const transaction = adapter.normalize(request.body, connection.restaurantId);
        await upsertNormalizedTransaction(transaction);
        await finishRawIntegrationEvent(rawEventId, 'processed');
        await db
          .update(paymentConnections)
          .set({ lastEventAt: new Date(), lastError: null, updatedAt: new Date() })
          .where(eq(paymentConnections.id, connection.id));
        request.log.info(
          { provider: typedProvider, restaurantId: connection.restaurantId, externalSaleId: transaction.externalSaleId, result: 'ok' },
          'payment event processed',
        );
      } catch (error) {
        await finishRawIntegrationEvent(rawEventId, 'failed', 'Não foi possível interpretar o evento recebido.');
        await db
          .update(paymentConnections)
          .set({ status: 'error', lastError: 'Não foi possível interpretar o último pagamento.', updatedAt: new Date() })
          .where(eq(paymentConnections.id, connection.id));
        request.log.error({ err: error, provider: typedProvider, restaurantId: connection.restaurantId }, 'payment event failed');
      }
      return reply.code(200).send({ received: true });
    }

    if (provider !== 'mercado_pago') return reply.code(404).send({ error: 'Not found' });
    const dataId = getNestedString(request.body, ['data', 'id']) ?? getNestedString(request.query, ['data.id']);
    const externalAccountId = getNestedString(request.body, ['user_id']);
    const connectionId = getNestedString(request.query, ['connection_id']);
    if (!externalAccountId && !connectionId) return reply.code(200).send({ received: true });
    const [connection] = await db
      .select()
      .from(paymentConnections)
      .where(
        and(
          eq(paymentConnections.provider, provider),
          connectionId ? eq(paymentConnections.id, connectionId) : eq(paymentConnections.externalAccountId, externalAccountId!),
          eq(paymentConnections.status, 'connected'),
        ),
      )
      .limit(1);
    if (!connection?.accessToken) return reply.code(200).send({ received: true });
    const webhookSecret = connection.refreshToken ? decryptIntegrationSecret(connection.refreshToken) : env.MERCADO_PAGO_WEBHOOK_SECRET;
    if (
      !dataId ||
      !verifyMercadoPagoSignature({
        dataId,
        requestId: getHeader(request, 'x-request-id'),
        signature: getHeader(request, 'x-signature'),
        secret: webhookSecret,
      })
    ) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    try {
      const payment = await getMercadoPagoPayment(dataId, decryptIntegrationSecret(connection.accessToken));
      const transaction = normalizeMercadoPagoPayment(payment, connection.restaurantId);
      await upsertNormalizedTransaction(transaction);
      if (transaction.orderId) {
        await db
          .update(orders)
          .set({ paymentStatus: transaction.paymentStatus, pixChargeId: transaction.pixChargeId ?? null, updatedAt: new Date() })
          .where(and(eq(orders.id, transaction.orderId), eq(orders.restaurantId, connection.restaurantId)));
      }
      await db.update(paymentConnections).set({ lastEventAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(paymentConnections.id, connection.id));
      request.log.info({ provider, restaurantId: connection.restaurantId, externalSaleId: transaction.externalSaleId, result: 'ok' }, 'payment event processed');
    } catch (error) {
      await db.update(paymentConnections).set({ status: 'error', lastError: 'Não foi possível confirmar o último pagamento.', updatedAt: new Date() }).where(eq(paymentConnections.id, connection.id));
      request.log.error({ err: error, provider, restaurantId: connection.restaurantId }, 'payment event failed');
    }
    return reply.code(200).send({ received: true });
  });
};
