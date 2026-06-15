import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { customers, orderItems, orders, paymentConnections } from '../db/schema.js';
import { env } from '../env.js';
import { CreateOrderSchema } from '../schemas.js';
import { requireRoles } from '../plugins/auth.js';
import { toOrderDto } from '../utils/format.js';
import { sanitizeText } from '../utils/security.js';
import { writeAuditLog } from '../utils/audit.js';
import { paginationMeta, parsePagination, type PaginationQuery } from '../utils/pagination.js';
import { decryptIntegrationSecret } from '../utils/integrationCrypto.js';
import { createMercadoPagoPix } from '../integrations/payments/mercado_pago/client.js';
import { normalizeMercadoPagoPayment } from '../integrations/payments/mercado_pago/adapter.js';
import { createPagBankPix } from '../integrations/payments/pagbank/client.js';
import { createInfinitePayCheckout } from '../integrations/payments/infinitepay/client.js';
import { upsertNormalizedTransaction } from '../services/transactions.js';

const PixChargeSchema = z.object({
  payer_email: z.string().email().max(255).optional(),
  provider: z.enum(['mercado_pago', 'pagbank']).default('mercado_pago'),
});

export const orderRoutes = async (app: FastifyInstance) => {
  app.get('/orders', { preHandler: [app.authenticate, requireRoles('owner', 'admin', 'manager')] }, async (request) => {
    const auth = request.auth!;
    const { page, pageSize, offset } = parsePagination(request.query as PaginationQuery);
    const orderRows = await db
      .select()
      .from(orders)
      .where(and(eq(orders.restaurantId, auth.restaurantId), eq(orders.isDeleted, false)))
      .orderBy(desc(orders.orderDate))
      .limit(pageSize)
      .offset(offset);

    const ids = orderRows.map((order) => order.id);
    const itemRows = ids.length
      ? await db
          .select()
          .from(orderItems)
          .where(and(eq(orderItems.restaurantId, auth.restaurantId), inArray(orderItems.orderId, ids)))
      : [];

    return {
      data: orderRows.map((order) => toOrderDto(order, itemRows.filter((item) => item.orderId === order.id))),
      pagination: paginationMeta(page, pageSize, orderRows.length),
    };
  });

  app.post('/orders', { preHandler: [app.authenticate, requireRoles('owner', 'admin', 'manager')] }, async (request, reply) => {
    const parsed = CreateOrderSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Dados invalidos. Revise o pedido e tente novamente.' });
    }
    const auth = request.auth!;
    const input = parsed.data;

    if (input.customer_id) {
      const [customer] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.id, input.customer_id), eq(customers.restaurantId, auth.restaurantId), eq(customers.isDeleted, false)))
        .limit(1);

      if (!customer) return reply.code(404).send({ error: 'Cliente não encontrado' });
    }

    const total = input.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const created = await db.transaction(async (tx) => {
      const [order] = await tx
        .insert(orders)
        .values({
          restaurantId: auth.restaurantId,
          customerId: input.customer_id || null,
          customerName: sanitizeText(input.customer_name, 100),
          totalAmount: total.toFixed(2),
          channel: input.channel,
          status: input.status,
          paymentMethod: sanitizeText(input.payment_method, 60),
          notes: input.notes ? sanitizeText(input.notes, 1000) : null,
        })
        .returning();

      const items = await tx
        .insert(orderItems)
        .values(
          input.items.map((item) => ({
            restaurantId: auth.restaurantId,
            orderId: order.id,
            name: sanitizeText(item.name, 120),
            quantity: item.quantity,
            price: item.price.toFixed(2),
            category: sanitizeText(item.category, 80),
          })),
        )
        .returning();

      return { order, items };
    });

    await writeAuditLog({
      request,
      restaurantId: auth.restaurantId,
      userId: auth.userId,
      action: 'order_created',
      resourceType: 'order',
      resourceId: created.order.id,
      newData: { total, items: created.items.length },
    });

    return reply.code(201).send({ data: toOrderDto(created.order, created.items) });
  });

  app.post('/orders/:id/pix-charge', { preHandler: [app.authenticate, requireRoles('owner', 'admin', 'manager')] }, async (request, reply) => {
    const auth = request.auth!;
    const orderId = z.string().uuid().safeParse((request.params as { id?: string }).id);
    const body = PixChargeSchema.safeParse(request.body ?? {});
    if (!orderId.success || !body.success) return reply.code(400).send({ error: 'Revise os dados da cobrança.' });

    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId.data), eq(orders.restaurantId, auth.restaurantId), eq(orders.isDeleted, false)))
      .limit(1);
    if (!order) return reply.code(404).send({ error: 'Pedido não encontrado.' });

    const customerEmail = order.customerId
      ? (
          await db
            .select({ email: customers.email })
            .from(customers)
            .where(and(eq(customers.id, order.customerId), eq(customers.restaurantId, auth.restaurantId)))
            .limit(1)
        )[0]?.email
      : null;
    const payerEmail = body.data.payer_email ?? customerEmail;
    if (!payerEmail) return reply.code(400).send({ error: 'Informe o e-mail do cliente para gerar o Pix.' });

    const [connection] = await db
      .select({ accessToken: paymentConnections.accessToken })
      .from(paymentConnections)
      .where(
        and(
          eq(paymentConnections.restaurantId, auth.restaurantId),
          eq(paymentConnections.provider, body.data.provider),
          eq(paymentConnections.status, 'connected'),
        ),
      )
      .limit(1);
    if (!connection?.accessToken) return reply.code(409).send({ error: 'Ative o pagamento automático nas configurações.' });

    try {
      const accessToken = decryptIntegrationSecret(connection.accessToken);
      const payment =
        body.data.provider === 'pagbank'
          ? await createPagBankPix({
              accessToken,
              orderId: order.id,
              amount: Number(order.totalAmount),
              customerName: order.customerName,
              customerEmail: payerEmail,
              notificationUrl: `${request.protocol}://${request.headers.host}/webhooks/payments/pagbank`,
            })
          : await createMercadoPagoPix({
              accessToken,
              orderId: order.id,
              amount: Number(order.totalAmount),
              payerEmail,
              description: `Pedido ${order.id}`,
            });
      const pagBankQr =
        Array.isArray(payment.qr_codes) && payment.qr_codes[0] && typeof payment.qr_codes[0] === 'object'
          ? (payment.qr_codes[0] as Record<string, unknown>)
          : {};
      const transaction =
        body.data.provider === 'pagbank'
          ? {
              externalSaleId: typeof payment.id === 'string' ? payment.id : order.id,
              orderId: order.id,
              restaurantId: auth.restaurantId,
              totalAmount: Number(order.totalAmount),
              source: 'pagbank',
              paymentMethod: 'pix' as const,
              paymentStatus: 'pending' as const,
              pixChargeId: typeof pagBankQr.id === 'string' ? pagBankQr.id : null,
              createdAt: new Date().toISOString(),
            }
          : normalizeMercadoPagoPayment(payment, auth.restaurantId);
      await upsertNormalizedTransaction(transaction);
      await db
        .update(orders)
        .set({ paymentStatus: transaction.paymentStatus, pixChargeId: transaction.pixChargeId ?? null, updatedAt: new Date() })
        .where(and(eq(orders.id, order.id), eq(orders.restaurantId, auth.restaurantId)));

      const pointOfInteraction =
        payment.point_of_interaction && typeof payment.point_of_interaction === 'object'
          ? (payment.point_of_interaction as Record<string, unknown>)
          : {};
      const transactionData =
        pointOfInteraction.transaction_data && typeof pointOfInteraction.transaction_data === 'object'
          ? (pointOfInteraction.transaction_data as Record<string, unknown>)
          : {};
      return {
        data: {
          payment_status: transaction.paymentStatus,
          qr_code:
            typeof transactionData.qr_code === 'string'
              ? transactionData.qr_code
              : typeof pagBankQr.text === 'string'
                ? pagBankQr.text
                : null,
          qr_code_base64: typeof transactionData.qr_code_base64 === 'string' ? transactionData.qr_code_base64 : null,
          ticket_url:
            typeof transactionData.ticket_url === 'string'
              ? transactionData.ticket_url
              : Array.isArray(pagBankQr.links) &&
                  pagBankQr.links[0] &&
                  typeof pagBankQr.links[0] === 'object' &&
                  typeof (pagBankQr.links[0] as Record<string, unknown>).href === 'string'
                ? String((pagBankQr.links[0] as Record<string, unknown>).href)
                : null,
        },
      };
    } catch (error) {
      request.log.error({ err: error, restaurantId: auth.restaurantId, orderId: order.id }, 'pix charge creation failed');
      return reply.code(502).send({ error: 'Não foi possível gerar o Pix agora. O pedido continua normalmente.' });
    }
  });

  app.post('/orders/:id/payment-link', { preHandler: [app.authenticate, requireRoles('owner', 'admin', 'manager')] }, async (request, reply) => {
    const auth = request.auth!;
    const orderId = z.string().uuid().safeParse((request.params as { id?: string }).id);
    const body = z.object({ provider: z.literal('infinitepay') }).safeParse(request.body);
    if (!orderId.success || !body.success) return reply.code(400).send({ error: 'Revise os dados da cobrança.' });

    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId.data), eq(orders.restaurantId, auth.restaurantId), eq(orders.isDeleted, false)))
      .limit(1);
    if (!order) return reply.code(404).send({ error: 'Pedido não encontrado.' });

    const [connection] = await db
      .select({ handle: paymentConnections.externalAccountId })
      .from(paymentConnections)
      .where(
        and(
          eq(paymentConnections.restaurantId, auth.restaurantId),
          eq(paymentConnections.provider, 'infinitepay'),
          eq(paymentConnections.status, 'connected'),
        ),
      )
      .limit(1);
    if (!connection?.handle) return reply.code(409).send({ error: 'Conecte sua conta InfinitePay nas configurações.' });

    try {
      const checkout = await createInfinitePayCheckout({
        handle: connection.handle,
        orderId: order.id,
        amount: Number(order.totalAmount),
        description: `Pedido ${order.id}`,
        webhookUrl: `${request.protocol}://${request.headers.host}/webhooks/payments/infinitepay`,
        redirectUrl: `${env.APP_URL}/app/pedidos?pagamento=confirmando`,
      });
      await upsertNormalizedTransaction({
        externalSaleId: checkout.slug ?? order.id,
        orderId: order.id,
        restaurantId: auth.restaurantId,
        totalAmount: Number(order.totalAmount),
        source: 'infinitepay',
        paymentMethod: 'unknown',
        paymentStatus: 'pending',
        createdAt: new Date().toISOString(),
      });
      return { data: { url: checkout.url, payment_status: 'pending' } };
    } catch (error) {
      request.log.error({ err: error, restaurantId: auth.restaurantId, orderId: order.id }, 'payment link creation failed');
      return reply.code(502).send({ error: 'Não foi possível criar o link de pagamento agora. O pedido continua normalmente.' });
    }
  });
};
