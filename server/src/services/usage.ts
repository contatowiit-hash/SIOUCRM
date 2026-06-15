import { and, asc, eq, gte, gt, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { messageUsage, restaurants, subscriptions } from '../db/schema.js';
import { env } from '../env.js';

export type UsageType = 'ai' | 'whatsapp';
export type PlanId = typeof restaurants.$inferSelect.plan;

export const PLAN_QUOTAS: Record<PlanId, Record<UsageType, number | null>> = {
  free: { ai: 0, whatsapp: 0 },
  plus: { ai: 500, whatsapp: 1_000 },
  starter: { ai: 500, whatsapp: 1_000 },
  pro: { ai: 2_000, whatsapp: 5_000 },
  premium: { ai: 10_000, whatsapp: 20_000 },
  lifetime: { ai: null, whatsapp: null },
  founder_lifetime: { ai: null, whatsapp: null },
};

export const OVERAGE_PRICES: Record<UsageType, number> = {
  ai: 0.06,
  whatsapp: 0.06,
};

const METER_EVENT_NAMES: Record<UsageType, string> = {
  ai: 'mensagens_ia',
  whatsapp: 'mensagens_whatsapp',
};

const firstOfMonth = (date = new Date()) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
const firstOfNextMonth = (date = new Date()) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));

const toNumber = (value: unknown) => Number(value ?? 0);

const isActiveSubscription = (status: string | null | undefined) =>
  status === 'active' || status === 'trialing' || status === 'past_due';

export const getPlanQuotas = (plan: PlanId) => PLAN_QUOTAS[plan] ?? PLAN_QUOTAS.free;

export const getEffectivePlan = async (restaurantId: string) => {
  const [row] = await db
    .select({
      restaurantId: restaurants.id,
      restaurantPlan: restaurants.plan,
      stripeAiMeterItemId: restaurants.stripeAiMeterItemId,
      stripeWhatsappMeterItemId: restaurants.stripeWhatsappMeterItemId,
      subscriptionPlan: subscriptions.plan,
      subscriptionStatus: subscriptions.status,
      subscriptionLifetime: subscriptions.lifetime,
      providerCustomerId: subscriptions.providerCustomerId,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      expiresAt: subscriptions.expiresAt,
    })
    .from(restaurants)
    .leftJoin(subscriptions, eq(subscriptions.restaurantId, restaurants.id))
    .where(and(eq(restaurants.id, restaurantId), eq(restaurants.isDeleted, false)))
    .limit(1);

  if (!row) return null;

  const plan =
    row.subscriptionPlan && isActiveSubscription(row.subscriptionStatus) ? row.subscriptionPlan : row.restaurantPlan;

  return {
    ...row,
    plan,
    quotas: getPlanQuotas(plan),
  };
};

export const getCurrentUsage = async (restaurantId: string, date = new Date()) => {
  const periodStart = firstOfMonth(date);
  const periodEnd = firstOfNextMonth(date);

  const rows = await db
    .select({
      type: messageUsage.type,
      total: sql<number>`coalesce(sum(${messageUsage.quantity}), 0)`,
    })
    .from(messageUsage)
    .where(and(eq(messageUsage.restaurantId, restaurantId), gte(messageUsage.createdAt, periodStart)))
    .groupBy(messageUsage.type);

  const used: Record<UsageType, number> = { ai: 0, whatsapp: 0 };
  for (const row of rows) {
    used[row.type] = toNumber(row.total);
  }

  return { periodStart, periodEnd, used };
};

const getStripeCustomerId = (planRow: NonNullable<Awaited<ReturnType<typeof getEffectivePlan>>>) =>
  planRow.providerCustomerId ?? null;

const sendStripeMeterEvent = async ({
  customerId,
  type,
  quantity,
  identifier,
}: {
  customerId: string;
  type: UsageType;
  quantity: number;
  identifier: string;
}) => {
  if (!env.STRIPE_SECRET_KEY) return null;

  const body = new URLSearchParams({
    event_name: METER_EVENT_NAMES[type],
    identifier,
    'payload[stripe_customer_id]': customerId,
    'payload[value]': String(quantity),
  });

  const response = await fetch('https://api.stripe.com/v1/billing/meter_events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const data = (await response.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Nao foi possivel registrar uso no Stripe');
  }

  return data?.id ?? identifier;
};

export const flushPendingMeterEvents = async (restaurantId: string, customerId: string) => {
  if (!env.STRIPE_SECRET_KEY) return 0;

  const pending = await db
    .select({
      id: messageUsage.id,
      type: messageUsage.type,
      billableQuantity: messageUsage.billableQuantity,
    })
    .from(messageUsage)
    .where(
      and(
        eq(messageUsage.restaurantId, restaurantId),
        gt(messageUsage.billableQuantity, 0),
        isNull(messageUsage.stripeReportedAt),
      ),
    )
    .orderBy(asc(messageUsage.createdAt))
    .limit(100);

  let reported = 0;
  for (const usage of pending) {
    const stripeEventId = await sendStripeMeterEvent({
      customerId,
      type: usage.type,
      quantity: usage.billableQuantity,
      identifier: `usage_${usage.id}`,
    });

    await db
      .update(messageUsage)
      .set({ stripeMeterEventId: stripeEventId, stripeReportedAt: new Date() })
      .where(and(eq(messageUsage.id, usage.id), isNull(messageUsage.stripeReportedAt)));
    reported += 1;
  }

  return reported;
};

export const recordUsage = async (restaurantId: string, type: UsageType, quantity = 1) => {
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 1_000) {
    throw new Error('Quantidade de uso invalida');
  }

  const planRow = await getEffectivePlan(restaurantId);
  if (!planRow) {
    throw new Error('Restaurante nao encontrado');
  }

  if (planRow.plan === 'free') {
    throw new Error('Plano sem acesso ao recurso');
  }

  const quota = planRow.quotas[type];
  const periodStart = firstOfMonth();
  const usage = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${restaurantId}:${type}`}))`);

    const [current] = await tx
      .select({ total: sql<number>`coalesce(sum(${messageUsage.quantity}), 0)` })
      .from(messageUsage)
      .where(
        and(
          eq(messageUsage.restaurantId, restaurantId),
          eq(messageUsage.type, type),
          gte(messageUsage.createdAt, periodStart),
        ),
      );

    const usedBeforeInsert = toNumber(current?.total);
    const billableQuantity =
      quota === null ? 0 : Math.max(0, usedBeforeInsert + quantity - Math.max(quota, usedBeforeInsert));
    const [inserted] = await tx
      .insert(messageUsage)
      .values({ restaurantId, type, quantity, billableQuantity })
      .returning({ id: messageUsage.id, billableQuantity: messageUsage.billableQuantity });

    return inserted;
  });

  const overQuotaQuantity = usage.billableQuantity;
  if (quota === null) {
    return { recorded: true, stripeReported: false, usageId: usage.id, overQuotaQuantity: 0 };
  }

  const customerId = getStripeCustomerId(planRow);
  if (!customerId || !env.STRIPE_SECRET_KEY) {
    return { recorded: true, stripeReported: false, usageId: usage.id, overQuotaQuantity };
  }

  await flushPendingMeterEvents(restaurantId, customerId);

  return { recorded: true, stripeReported: overQuotaQuantity > 0, usageId: usage.id, overQuotaQuantity };
};

export const getUsageBillingSummary = async (restaurantId: string, includeFinancials: boolean) => {
  const planRow = await getEffectivePlan(restaurantId);
  if (!planRow) return null;

  const currentUsage = await getCurrentUsage(restaurantId);
  const aiQuota = planRow.quotas.ai;
  const whatsappQuota = planRow.quotas.whatsapp;
  const aiOverage = aiQuota === null ? 0 : Math.max(0, currentUsage.used.ai - aiQuota);
  const whatsappOverage = whatsappQuota === null ? 0 : Math.max(0, currentUsage.used.whatsapp - whatsappQuota);
  const estimatedExtraAmount = Number(
    (aiOverage * OVERAGE_PRICES.ai + whatsappOverage * OVERAGE_PRICES.whatsapp).toFixed(2),
  );

  return {
    plan: {
      id: planRow.plan,
      ai_quota: aiQuota,
      whatsapp_quota: whatsappQuota,
      renews_at: planRow.expiresAt?.toISOString() ?? null,
    },
    usage: {
      ai_used: currentUsage.used.ai,
      whatsapp_used: currentUsage.used.whatsapp,
      ai_remaining: aiQuota === null ? null : Math.max(0, aiQuota - currentUsage.used.ai),
      whatsapp_remaining: whatsappQuota === null ? null : Math.max(0, whatsappQuota - currentUsage.used.whatsapp),
      ai_overage: aiOverage,
      whatsapp_overage: whatsappOverage,
    },
    billing: {
      financials_visible: includeFinancials,
      ai_overage_price: includeFinancials ? OVERAGE_PRICES.ai : null,
      whatsapp_overage_price: includeFinancials ? OVERAGE_PRICES.whatsapp : null,
      estimated_extra_amount: includeFinancials ? estimatedExtraAmount : null,
    },
    stripe_customer_id: planRow.providerCustomerId ?? null,
    period: {
      start: currentUsage.periodStart.toISOString(),
      end: currentUsage.periodEnd.toISOString(),
    },
  };
};
