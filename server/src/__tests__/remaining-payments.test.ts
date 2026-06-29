import 'dotenv/config';
import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/syntra_test';
process.env.JWT_SECRET ??= 'test-jwt-secret-with-at-least-32-characters';
process.env.REFRESH_TOKEN_SECRET ??= 'test-refresh-secret-with-at-least-32-characters';

const { normalizeGenericPaymentPayload, verifyGenericPaymentSignature } = await import(
  '../integrations/payments/shared/generic-adapter.js'
);
const { verifyPagBankAuthenticity } = await import('../integrations/payments/pagbank/official-adapter.js');
const { createInfinitePayCheckout } = await import('../integrations/payments/infinitepay/client.js');

const root = process.cwd();
const read = (file: string) => readFile(join(root, file), 'utf8');
const providers = ['stone', 'pagbank', 'cielo', 'getnet', 'rede', 'ton', 'safrapay', 'infinitepay'];

test('adapters das oito adquirentes existem isolados', async () => {
  for (const provider of providers) {
    const adapter = await read(`server/src/integrations/payments/${provider}/adapter.ts`);
    assert.match(adapter, new RegExp(`provider: '${provider}'`));
    assert.match(adapter, /verifyGenericPaymentSignature/);
  }
});

test('adapter genérico não confia no restaurant_id do payload', () => {
  const trustedRestaurantId = crypto.randomUUID();
  const transaction = normalizeGenericPaymentPayload({
    provider: 'stone',
    restaurantId: trustedRestaurantId,
    payload: {
      restaurant_id: crypto.randomUUID(),
      transaction_id: 'transaction-1',
      amount: 59.9,
      status: 'approved',
      payment_method: 'credit_card',
    },
  });
  assert.equal(transaction.restaurantId, trustedRestaurantId);
  assert.equal(transaction.paymentStatus, 'paid');
  assert.equal(transaction.paymentMethod, 'card');
});

test('assinatura genérica rejeita evento adulterado', () => {
  const rawBody = JSON.stringify({ event_id: 'event-1', amount: 10 });
  const secret = 'provider-webhook-secret-example';
  const signature = createHmac('sha256', secret).update(rawBody).digest('hex');
  assert.equal(verifyGenericPaymentSignature(rawBody, signature, secret), true);
  assert.equal(verifyGenericPaymentSignature(`${rawBody}x`, signature, secret), false);
});

test('assinatura oficial do PagBank rejeita payload adulterado', () => {
  const rawBody = JSON.stringify({ reference_id: crypto.randomUUID(), status: 'PAID' });
  const accessToken = 'pagbank-access-token-example';
  const authenticity = createHash('sha256').update(`${accessToken}-${rawBody}`).digest('hex');
  assert.equal(verifyPagBankAuthenticity(rawBody, authenticity, accessToken), true);
  assert.equal(verifyPagBankAuthenticity(`${rawBody}x`, authenticity, accessToken), false);
});

test('InfinitePay cria checkout com valor em centavos e identificador do pedido', async () => {
  const originalFetch = globalThis.fetch;
  const sentBodies: Record<string, unknown>[] = [];
  globalThis.fetch = async (_input, init) => {
    sentBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({ url: 'https://checkout.infinitepay.io/example', invoice_slug: 'invoice-1' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const orderId = crypto.randomUUID();
    const result = await createInfinitePayCheckout({
      handle: 'restaurante',
      orderId,
      amount: 49.9,
      description: 'Pedido',
      webhookUrl: 'https://example.com/webhooks/payments/infinitepay',
      redirectUrl: 'https://example.com/app/pedidos',
    });
    assert.equal(result.url, 'https://checkout.infinitepay.io/example');
    assert.equal(sentBodies[0]?.order_nsu, orderId);
    assert.deepEqual(sentBodies[0]?.items, [{ quantity: 1, price: 4990, description: 'Pedido' }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('evento bruto é salvo antes da normalização e nunca é enviado para logs', async () => {
  const webhook = await read('server/src/routes/webhooks/integrations.ts');
  const savePosition = webhook.indexOf('saveRawIntegrationEvent({');
  const normalizePosition = webhook.indexOf('adapter.normalize(request.body');
  assert.ok(savePosition >= 0 && normalizePosition > savePosition);
  assert.doesNotMatch(webhook, /request\.log\.(?:info|error)\(\{[^}]*payload/s);
});

test('migration registra adquirentes e armazenamento de eventos brutos', async () => {
  const migration = await read('server/migrations/0016_remaining_payment_providers.sql');
  assert.match(migration, /create table if not exists integration_webhook_events/);
  assert.match(migration, /'not_configured'/);
  for (const provider of providers) {
    assert.match(migration, new RegExp(`\\('${provider}'\\)`));
  }
});

test('interface diferencia cadastro externo de integrações conectáveis', async () => {
  const panel = await read('src/components/IntegrationsPanel.tsx');
  assert.match(panel, /not_configured: 'Cadastro necessário'/);
  assert.match(panel, /Identificador da sua InfinitePay/);
  assert.match(panel, /api\.connectPayment\(payment\.provider, \{ handle:/);
  assert.match(panel, /Receber pagamentos/);
  assert.doesNotMatch(panel, /PDV|Goomer|caixa para o Syntra|caixa para o SIOU/);
});

test('PagBank e InfinitePay possuem fluxos reais de cobrança', async () => {
  const pagBankClient = await read('server/src/integrations/payments/pagbank/client.ts');
  const pagBankAdapter = await read('server/src/integrations/payments/pagbank/official-adapter.ts');
  const infinitePayClient = await read('server/src/integrations/payments/infinitepay/client.ts');
  const orders = await read('server/src/routes/orders.ts');
  const webhooks = await read('server/src/routes/webhooks/integrations.ts');
  assert.match(pagBankClient, /\/oauth2\/token/);
  assert.match(pagBankClient, /\/orders/);
  assert.match(pagBankAdapter, /accessToken-\$\{rawBody\}|`\$\{accessToken\}-\$\{rawBody\}`/);
  assert.match(infinitePayClient, /\/invoices\/public\/checkout\/links/);
  assert.match(infinitePayClient, /\/invoices\/public\/checkout\/payment_check/);
  assert.match(orders, /\/orders\/:id\/payment-link/);
  assert.match(webhooks, /provider === 'pagbank'/);
  assert.match(webhooks, /provider === 'infinitepay'/);
});

test('variáveis privadas das adquirentes não podem usar prefixo VITE', async () => {
  const env = await read('server/src/env.ts');
  for (const provider of ['STONE', 'PAGBANK', 'CIELO', 'GETNET', 'REDE', 'TON', 'SAFRAPAY', 'INFINITEPAY']) {
    assert.match(env, new RegExp(`VITE_${provider}_CLIENT_SECRET`));
    assert.match(env, new RegExp(`VITE_${provider}_WEBHOOK_SECRET`));
  }
});
