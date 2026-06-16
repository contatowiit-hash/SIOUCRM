import 'dotenv/config';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/syntra_test';
process.env.JWT_SECRET ??= 'test-jwt-secret-with-at-least-32-characters';
process.env.REFRESH_TOKEN_SECRET ??= 'test-refresh-secret-with-at-least-32-characters';
process.env.INTEGRATION_ENCRYPTION_KEY ??= 'test-integration-encryption-key-with-32-characters';

const { encryptIntegrationSecret, decryptIntegrationSecret } = await import('../utils/integrationCrypto.js');
const { normalizeGenericPdvPayload } = await import('../integrations/pdv/shared/normalize.js');
const { normalizeGoomerOrderPayload } = await import('../integrations/pdv/goomer/adapter.js');
const { verifyGoomerWebhookSignature } = await import('../integrations/pdv/goomer/client.js');
const { verifyMercadoPagoSignature } = await import('../integrations/payments/mercado_pago/adapter.js');

const root = process.cwd();
const read = (file: string) => readFile(join(root, file), 'utf8');

test('credenciais de integrações são criptografadas em repouso', () => {
  const token = 'provider-token-private-example';
  const encrypted = encryptIntegrationSecret(token);
  assert.notEqual(encrypted, token);
  assert.doesNotMatch(encrypted, /provider-token/);
  assert.equal(decryptIntegrationSecret(encrypted), token);
});

test('assinatura oficial do Mercado Pago é validada com timing safe comparison', () => {
  const dataId = '123456';
  const requestId = 'request-id';
  const ts = '1710000000';
  const secret = 'mercado-pago-webhook-secret-example';
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', secret).update(manifest).digest('hex');
  assert.equal(verifyMercadoPagoSignature({ dataId, requestId, signature: `ts=${ts},v1=${v1}`, secret }), true);
  assert.equal(verifyMercadoPagoSignature({ dataId, requestId, signature: `ts=${ts},v1=bad`, secret }), false);
});

test('adapter de PDV usa restaurantId confiável fornecido pela conexão', () => {
  const trustedRestaurantId = crypto.randomUUID();
  const transaction = normalizeGenericPdvPayload({
    provider: 'saipos',
    restaurantId: trustedRestaurantId,
    payload: {
      restaurant_id: crypto.randomUUID(),
      order_id: 'sale-1',
      total: 42.5,
      status: 'paid',
      items: [{ name: 'Pizza', quantity: 1, price: 42.5 }],
    },
  });
  assert.equal(transaction.restaurantId, trustedRestaurantId);
  assert.equal(transaction.totalAmount, 42.5);
  assert.equal(transaction.paymentStatus, 'paid');
});

test('Goomer valida webhook por assinatura HMAC do corpo bruto', () => {
  const rawBody = JSON.stringify({
    eventId: crypto.randomUUID(),
    eventType: 'CREATED',
    orderId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  });
  const secret = 'goomer-client-secret-example';
  const signature = createHmac('sha256', secret).update(rawBody).digest('hex');

  assert.equal(verifyGoomerWebhookSignature(rawBody, signature, secret), true);
  assert.equal(verifyGoomerWebhookSignature(`${rawBody}x`, signature, secret), false);
});

test('Goomer usa OAuth client_credentials em formulario e cache de 7 dias', async () => {
  const client = await read('server/src/integrations/pdv/goomer/client.ts');

  assert.match(client, /application\/x-www-form-urlencoded/);
  assert.match(client, /grant_type:\s*'client_credentials'/);
  assert.match(client, /TOKEN_CACHE_TTL_MS\s*=\s*7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(client, /accessTokenCacheUntil/);
  assert.match(client, /validateGoomerCredentials/);
  assert.doesNotMatch(client, /application\/json/);
});

test('Goomer normaliza pedido OpenDelivery sem confiar no restaurante do payload', () => {
  const trustedRestaurantId = crypto.randomUUID();
  const transaction = normalizeGoomerOrderPayload(
    {
      id: 'goomer-order-1',
      createdAt: '2026-06-15T10:00:00.000Z',
      total: { orderAmount: { value: 89.9, currency: 'BRL' } },
      payments: { prepaid: 89.9, pending: 0, methods: [{ method: 'PIX', type: 'PREPAID' }] },
      items: [{ name: 'Pizza Calabresa', quantity: 2, totalPrice: { value: 79.8, currency: 'BRL' } }],
    },
    trustedRestaurantId,
    'CREATED',
  );

  assert.equal(transaction.restaurantId, trustedRestaurantId);
  assert.equal(transaction.externalSaleId, 'goomer-order-1');
  assert.equal(transaction.totalAmount, 89.9);
  assert.equal(transaction.paymentMethod, 'pix');
  assert.equal(transaction.paymentStatus, 'paid');
  assert.equal(transaction.items?.[0]?.name, 'Pizza Calabresa');
});

test('rotas de integração não retornam tokens e restringem alterações ao owner', async () => {
  const routes = await read('server/src/routes/integrations.ts');
  assert.match(routes, /select\(\{ provider: paymentConnections\.provider, status: paymentConnections\.status/);
  assert.match(routes, /select\(\{ provider: pdvConnections\.provider, status: pdvConnections\.status, webhookUrl: pdvConnections\.webhookUrl/);
  assert.doesNotMatch(routes, /reply\.(?:send|code\([^)]*\)\.send)\(\{[^}]*accessToken/s);
  assert.doesNotMatch(routes, /access_token:\s*connection\.accessToken/);
  assert.match(routes, /payments\/:provider\/connect'.*requireRoles\('owner'\)/s);
  assert.match(routes, /pdv\/:provider\/connect'.*requireRoles\('owner'\)/s);
  assert.match(routes, /pdv\/:provider\/test'.*requireRoles\('owner'\)/s);
  assert.match(routes, /payments\/:provider\/disconnect'.*requireRoles\('owner'\)/s);
});

test('webhooks resolvem restaurante pela conexão e rejeitam token inválido', async () => {
  const route = await read('server/src/routes/webhooks/integrations.ts');
  assert.match(route, /eq\(pdvConnections\.id, connectionId\)/);
  assert.match(route, /connection\.restaurantId/);
  assert.match(route, /safeEqual\(receivedToken, expectedToken\)/);
  assert.match(route, /verifyGoomerWebhookSignature/);
  assert.match(route, /fetchGoomerOrder/);
  assert.doesNotMatch(route, /restaurant_id.*request\.body/s);
});

test('migration cria conexões, transações idempotentes e campos opcionais de pagamento', async () => {
  const migration = await read('server/migrations/0015_integrations_payments_pdv.sql');
  assert.match(migration, /create table if not exists payment_connections/);
  assert.match(migration, /create table if not exists pdv_connections/);
  assert.match(migration, /create table if not exists transactions/);
  assert.match(migration, /unique \(restaurant_id, source, external_sale_id\)/);
  assert.match(migration, /add column if not exists payment_status/);
  assert.match(migration, /add column if not exists pix_charge_id/);
});

test('falha ao gerar Pix mantém o pedido e retorna erro humano', async () => {
  const orders = await read('server/src/routes/orders.ts');
  assert.match(orders, /O pedido continua normalmente/);
  assert.match(orders, /requireRoles\('owner', 'admin', 'manager'\)/);
  assert.doesNotMatch(orders, /delete\(orders\)/);
});

test('provedores principais usam credencial própria criptografada do restaurante', async () => {
  const routes = await read('server/src/routes/integrations.ts');
  const panel = await read('src/components/IntegrationsPanel.tsx');

  for (const provider of ['mercado_pago', 'pagbank', 'cielo', 'getnet']) {
    assert.match(routes, new RegExp(provider));
    assert.match(panel, new RegExp(provider));
  }
  assert.match(routes, /encryptIntegrationSecret\(accessSecret\)/);
  assert.match(routes, /payments\/:provider\/test/);
  assert.match(routes, /pdv\/:provider\/test/);
  assert.match(panel, /Salvar conexão/);
  assert.match(panel, /Testar conexao/);
  assert.match(panel, /Trocar códigos/);
  assert.match(panel, /Os códigos ficam protegidos/);
  assert.doesNotMatch(panel, /MERCADO_PAGO_CLIENT_SECRET/);
});

test('gatilho de teste valida recebimento sem criar pagamento real', async () => {
  const routes = await read('server/src/routes/integrations.ts');
  const service = await read('server/src/services/paymentReceiptTest.ts');
  const panel = await read('src/components/IntegrationsPanel.tsx');

  assert.match(routes, /payments\/:provider\/test-receipt/);
  assert.match(service, /Assinatura validada/);
  assert.match(service, /Notificação interpretada/);
  assert.match(service, /saveRawIntegrationEvent/);
  assert.doesNotMatch(service, /upsertNormalizedTransaction/);
  assert.doesNotMatch(service, /update\(orders\)/);
  assert.match(panel, /Testar recebimento/);
});
