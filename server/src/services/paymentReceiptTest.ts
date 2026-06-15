import { createHash, createHmac, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { paymentConnections } from '../db/schema.js';
import { normalizeCieloPayment, verifyCieloSignature } from '../integrations/payments/cielo/adapter.js';
import { normalizeGetnetPayment, verifyGetnetSignature } from '../integrations/payments/getnet/adapter.js';
import { normalizeMercadoPagoPayment, verifyMercadoPagoSignature } from '../integrations/payments/mercado_pago/adapter.js';
import { normalizeOfficialPagBankPayment, verifyPagBankAuthenticity } from '../integrations/payments/pagbank/official-adapter.js';
import { decryptIntegrationSecret } from '../utils/integrationCrypto.js';
import { finishRawIntegrationEvent, saveRawIntegrationEvent } from './integrationWebhookEvents.js';

type TestableProvider = 'mercado_pago' | 'pagbank' | 'cielo' | 'getnet';
type Connection = typeof paymentConnections.$inferSelect;

const genericTestPayload = (connection: Connection) => ({
  event_id: `syntra-test-${randomUUID()}`,
  event_type: 'syntra.connection_test',
  payment: {
    external_account_id: connection.externalAccountId ?? connection.id,
    transaction_id: `test-${randomUUID()}`,
    amount: 1.23,
    status: 'approved',
    payment_method: 'pix',
    created_at: new Date().toISOString(),
  },
});

const validateSyntheticEvent = (provider: TestableProvider, connection: Connection) => {
  if (!connection.accessToken) throw new Error('Missing connection credential');

  if (provider === 'mercado_pago') {
    if (!connection.refreshToken) throw new Error('Missing webhook confirmation code');
    const secret = decryptIntegrationSecret(connection.refreshToken);
    const dataId = `test-${randomUUID()}`;
    const requestId = randomUUID();
    const ts = String(Math.floor(Date.now() / 1000));
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const signature = `ts=${ts},v1=${createHmac('sha256', secret).update(manifest).digest('hex')}`;
    const valid = verifyMercadoPagoSignature({ dataId, requestId, signature, secret });
    const payload = {
      id: dataId,
      transaction_amount: 1.23,
      status: 'approved',
      payment_method_id: 'pix',
      date_created: new Date().toISOString(),
    };
    return { valid, payload, normalized: normalizeMercadoPagoPayment(payload, connection.restaurantId) };
  }

  if (provider === 'pagbank') {
    const token = decryptIntegrationSecret(connection.accessToken);
    const payload = {
      id: `test-${randomUUID()}`,
      reference_id: randomUUID(),
      created_at: new Date().toISOString(),
      charges: [{ id: `charge-${randomUUID()}`, status: 'PAID', amount: { value: 123 }, payment_method: { type: 'PIX' } }],
    };
    const rawBody = JSON.stringify(payload);
    const signature = createHash('sha256').update(`${token}-${rawBody}`).digest('hex');
    return { valid: verifyPagBankAuthenticity(rawBody, signature, token), payload, normalized: normalizeOfficialPagBankPayment(payload, connection.restaurantId) };
  }

  const payload = genericTestPayload(connection);
  const rawBody = JSON.stringify(payload);
  const secret =
    provider === 'cielo'
      ? decryptIntegrationSecret(connection.accessToken)
      : connection.refreshToken
        ? decryptIntegrationSecret(connection.refreshToken)
        : null;
  if (!secret) throw new Error('Missing webhook confirmation code');
  const signature = createHmac('sha256', secret).update(rawBody).digest('hex');
  return provider === 'cielo'
    ? { valid: verifyCieloSignature(rawBody, signature, secret), payload, normalized: normalizeCieloPayment(payload, connection.restaurantId) }
    : { valid: verifyGetnetSignature(rawBody, signature, secret), payload, normalized: normalizeGetnetPayment(payload, connection.restaurantId) };
};

export const runPaymentReceiptTest = async (provider: TestableProvider, connection: Connection) => {
  const result = validateSyntheticEvent(provider, connection);
  if (!result.valid || result.normalized.restaurantId !== connection.restaurantId) {
    throw new Error('Synthetic payment notification validation failed');
  }

  const eventId = await saveRawIntegrationEvent({
    restaurantId: connection.restaurantId,
    paymentConnectionId: connection.id,
    provider,
    eventType: 'syntra.connection_test',
    providerEventId: `syntra-test-${randomUUID()}`,
    payload: { test: true, provider, received_at: new Date().toISOString() },
  });
  await finishRawIntegrationEvent(eventId, 'processed');
  await db
    .update(paymentConnections)
    .set({ lastEventAt: new Date(), lastError: null, updatedAt: new Date() })
    .where(eq(paymentConnections.id, connection.id));

  return {
    provider,
    status: 'processed' as const,
    checks: ['Assinatura validada', 'Restaurante identificado', 'Notificação interpretada', 'Recebimento registrado'],
  };
};
