import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

const root = process.cwd();
const read = (file: string) => readFile(join(root, file), 'utf8');

test('schema e migration armazenam uso por restaurante', async () => {
  const schema = await read('server/src/db/schema.ts');
  const migration = await read('server/migrations/0014_metered_billing.sql');

  assert.match(schema, /messageUsageTypeEnum.*\['ai', 'whatsapp'\]/);
  assert.match(schema, /export const messageUsage = pgTable/);
  assert.match(schema, /stripeAiMeterItemId/);
  assert.match(schema, /stripeWhatsappMeterItemId/);
  assert.match(migration, /create table if not exists message_usage/);
  assert.match(migration, /restaurant_id uuid not null references restaurants\(id\) on delete cascade/);
  assert.match(migration, /quantity integer not null default 1 check \(quantity > 0\)/);
  assert.match(migration, /billable_quantity integer not null default 0 check \(billable_quantity >= 0\)/);
  assert.match(migration, /message_usage_pending_meter_idx/);
});

test('servico registra uso local e excedente no Stripe', async () => {
  const usage = await read('server/src/services/usage.ts');

  assert.match(usage, /plus: \{ ai: 500, whatsapp: 1_000 \}/);
  assert.match(usage, /pro: \{ ai: 2_000, whatsapp: 5_000 \}/);
  assert.match(usage, /premium: \{ ai: 10_000, whatsapp: 20_000 \}/);
  assert.match(usage, /founder_lifetime: \{ ai: null, whatsapp: null \}/);
  assert.match(usage, /ai: 0\.06/);
  assert.match(usage, /whatsapp: 0\.06/);
  assert.match(usage, /planRow\.plan === 'free'/);
  assert.match(usage, /insert\(messageUsage\)/);
  assert.match(usage, /https:\/\/api\.stripe\.com\/v1\/billing\/meter_events/);
  assert.match(usage, /event_name: METER_EVENT_NAMES\[type\]/);
  assert.match(usage, /payload\[stripe_customer_id\]/);
  assert.match(usage, /payload\[value\]/);
  assert.match(usage, /flushPendingMeterEvents/);
  assert.match(usage, /identifier: `usage_\$\{usage\.id\}`/);
  assert.match(usage, /pg_advisory_xact_lock/);
});

test('envios reais registram uso de IA e WhatsApp', async () => {
  const whatsappWebhook = await read('server/src/routes/webhooks/whatsapp.ts');
  const whatsapp = await read('server/src/routes/whatsapp.ts');
  const aiSupport = await read('server/src/utils/aiSupport.ts');

  assert.match(whatsappWebhook, /recordUsage\(restaurantId, 'ai'\)/);
  assert.match(whatsappWebhook, /recordUsage\(restaurantId, 'whatsapp'\)/);
  assert.match(whatsapp, /recordUsage\(auth\.restaurantId, 'whatsapp'\)/);
  assert.match(whatsapp, /if \(provider !== 'manual'\)/);
  assert.match(whatsapp, /requirePlan\('plus'\)/);
  assert.match(aiSupport, /plan\.plan === 'free'/);
});

test('endpoint de uso respeita RBAC financeiro', async () => {
  const usageRoute = await read('server/src/routes/usage.ts');
  const app = await read('server/src/app.ts');

  assert.match(usageRoute, /\/usage\/current/);
  assert.match(usageRoute, /requireRoles\('owner', 'admin', 'manager', 'agent'\)/);
  assert.match(usageRoute, /financialsVisible = auth\.role === 'owner'/);
  assert.match(usageRoute, /stripe_customer_id: stripeCustomerId/);
  assert.doesNotMatch(usageRoute, /\.\.\.summary,\s*billing:/);
  assert.match(app, /app\.register\(usageRoutes, \{ prefix: '\/api' \}\)/);
});

test('checkout e webhook guardam itens metered sem confundir com plano', async () => {
  const billing = await read('server/src/routes/billing.ts');
  const stripeWebhook = await read('server/src/routes/webhooks/stripe.ts');

  assert.match(billing, /isAvailableMeteredPrice/);
  assert.match(billing, /hasValidOveragePrices/);
  assert.match(billing, /checkout created without overage items/);
  for (const source of [billing, stripeWebhook]) {
    assert.match(source, /getMappedPlanPriceIdFromItems/);
    assert.match(source, /getMeterItemIdsFromSubscriptionObject/);
    assert.match(source, /stripeAiMeterItemId/);
    assert.match(source, /stripeWhatsappMeterItemId/);
  }
});
