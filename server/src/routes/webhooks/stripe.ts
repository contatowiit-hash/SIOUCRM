import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHmac, timingSafeEqual } from 'crypto';
import { eq, or } from 'drizzle-orm';
import {
  STRIPE_AI_OVERAGE_PRICE_ID,
  STRIPE_PRICE_MAP,
  STRIPE_WHATSAPP_OVERAGE_PRICE_ID,
} from '../../config/stripe-plans.js';
import { db } from '../../db/client.js';
import { restaurants, stripeWebhookEvents, subscriptions } from '../../db/schema.js';
import { env } from '../../env.js';
import { logDevelopmentOnly, redactSensitive, redactSensitiveText, safeErrorForLog } from '../../utils/logger.js';

type StripeEvent = {
  id?: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
};

type StripeLikeClient = {
  webhooks: {
    constructEvent: (payload: string, signature: string, secret: string) => StripeEvent;
  };
  checkout?: {
    sessions?: {
      listLineItems: (
        sessionId: string,
        options: { limit: number; expand?: string[] },
      ) => Promise<{ data?: Array<Record<string, unknown>> }>;
    };
  };
};

type Plan = typeof subscriptions.$inferInsert.plan;
type SubscriptionStatus = typeof subscriptions.$inferInsert.status;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const addDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

const valueToId = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') return value.id;
  return null;
};

const getNestedString = (source: unknown, path: string[]) => {
  let current = source;
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : null;
};

const getNestedRecord = (source: unknown, path: string[]) => {
  let current = source;
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return current && typeof current === 'object' ? current : null;
};

const getStripeStatus = (value: unknown): SubscriptionStatus => {
  if (value === 'past_due' || value === 'unpaid' || value === 'incomplete' || value === 'incomplete_expired') return 'past_due';
  if (value === 'canceled' || value === 'cancelled') return 'canceled';
  return 'active';
};

const getRawBody = (request: FastifyRequest) => {
  const rawBody = (request as FastifyRequest & { rawBody?: string }).rawBody;
  return rawBody || JSON.stringify(request.body || {});
};

const getStripeSignature = (header: string) => {
  const parts = header.split(',').reduce<Record<string, string[]>>((acc, part) => {
    const [key, value] = part.split('=');
    if (!key || !value) return acc;
    acc[key] = [...(acc[key] || []), value];
    return acc;
  }, {});

  return { timestamp: parts.t?.[0], signatures: parts.v1 || [] };
};

const safeCompareHex = (leftHex: string, rightHex: string) => {
  try {
    const left = Buffer.from(leftHex, 'hex');
    const right = Buffer.from(rightHex, 'hex');
    return left.length === right.length && timingSafeEqual(left, right);
  } catch {
    return false;
  }
};

const constructEventWithHmac = (payload: string, signature: string, secret: string) => {
  const { timestamp, signatures } = getStripeSignature(signature);
  if (!timestamp || !signatures.length) throw new Error('Stripe signature missing timestamp or v1 hash');

  const ageMs = Math.abs(Date.now() - Number(timestamp) * 1000);
  if (!Number.isFinite(ageMs) || ageMs > 5 * 60 * 1000) throw new Error('Stripe signature timestamp outside tolerance');

  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  const isValid = signatures.some((candidate) => safeCompareHex(expected, candidate));
  if (!isValid) throw new Error('Stripe signature mismatch');

  return JSON.parse(payload) as StripeEvent;
};

const loadStripeClient = async (): Promise<StripeLikeClient | null> => {
  if (!env.STRIPE_SECRET_KEY) return null;

  try {
    const stripeModule = await import('stripe');
    const Stripe = stripeModule.default;
    return Stripe ? (new Stripe(env.STRIPE_SECRET_KEY) as unknown as StripeLikeClient) : null;
  } catch {
    return null;
  }
};

const constructStripeEvent = async (request: FastifyRequest) => {
  const rawBody = getRawBody(request);
  const signature = request.headers['stripe-signature'];
  const signatureHeader = Array.isArray(signature) ? signature[0] : signature;

  if (!signatureHeader || !env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('Stripe webhook is not configured');
  }

  const stripe = await loadStripeClient();
  if (stripe) {
    return {
      event: stripe.webhooks.constructEvent(rawBody, signatureHeader, env.STRIPE_WEBHOOK_SECRET),
      stripe,
    };
  }

  return {
    event: constructEventWithHmac(rawBody, signatureHeader, env.STRIPE_WEBHOOK_SECRET),
    stripe: null,
  };
};

const getCustomFieldValue = (session: Record<string, unknown>, key: string) => {
  const customFields = Array.isArray(session.custom_fields) ? session.custom_fields : [];
  const field = customFields.find((item) => {
    if (!item || typeof item !== 'object' || !('key' in item)) return false;
    return typeof item.key === 'string' && item.key.toLowerCase() === key.toLowerCase();
  }) as
    | Record<string, unknown>
    | undefined;

  if (!field) return null;
  for (const source of [field.text, field.numeric, field.dropdown, field]) {
    if (source && typeof source === 'object' && 'value' in source) {
      const value = (source as Record<string, unknown>).value;
      if (typeof value === 'string') return value.trim();
    }
  }

  return null;
};

const getMetadataValue = (source: unknown, key: string) => {
  if (!source || typeof source !== 'object' || !(key in source)) return null;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' ? value.trim() : null;
};

const getRestaurantIdFromSession = (session: Record<string, unknown>) => {
  const fromCustomField = getCustomFieldValue(session, 'restaurant_id');
  if (fromCustomField) return fromCustomField;

  const fromCustomFieldCamel = getCustomFieldValue(session, 'restaurantId');
  if (fromCustomFieldCamel) return fromCustomFieldCamel;

  const fromMetadataCamel = getMetadataValue(session.metadata, 'restaurantId');
  if (fromMetadataCamel) return fromMetadataCamel;

  const fromMetadata = getMetadataValue(session.metadata, 'restaurant_id');
  if (fromMetadata) return fromMetadata;

  const fromClientReference = typeof session.client_reference_id === 'string' ? session.client_reference_id.trim() : null;
  if (fromClientReference) return fromClientReference;

  const subscriptionData = session.subscription_data;
  if (subscriptionData && typeof subscriptionData === 'object' && 'metadata' in subscriptionData) {
    const fromSubscriptionMetadataCamel = getMetadataValue(subscriptionData.metadata, 'restaurantId');
    if (fromSubscriptionMetadataCamel) return fromSubscriptionMetadataCamel;

    const fromSubscriptionMetadata = getMetadataValue(subscriptionData.metadata, 'restaurant_id');
    if (fromSubscriptionMetadata) return fromSubscriptionMetadata;
  }

  return null;
};

const getRestaurantDebugSources = (session: Record<string, unknown>) => {
  const subscriptionData = session.subscription_data;
  const hasSubscriptionMetadata =
    !!subscriptionData && typeof subscriptionData === 'object' && 'metadata' in subscriptionData;

  return redactSensitive({
    custom_fields_present: Array.isArray(session.custom_fields),
    metadata_keys:
      session.metadata && typeof session.metadata === 'object' ? Object.keys(session.metadata as Record<string, unknown>) : [],
    client_reference_id_present: typeof session.client_reference_id === 'string',
    subscription_metadata_present: hasSubscriptionMetadata,
  });
};

const logStripePlanDebug = (
  log: FastifyRequest['log'],
  details: {
    eventType: string;
    restaurantId: string | null;
    priceId: string | null;
    plan: Plan | null;
    subscriptionId: string | null;
    customerId: string | null;
    ignoreReason?: string;
  },
) => {
  const safeDetails = {
    ...details,
    subscriptionId: details.subscriptionId ? '[REDACTED]' : null,
    customerId: details.customerId ? '[REDACTED]' : null,
  };
  log.info(safeDetails, 'Stripe plan debug');
  logDevelopmentOnly('[stripe plan debug]', safeDetails);
};

const getPriceIdFromLineItem = (lineItem: Record<string, unknown> | undefined) => {
  if (!lineItem) return null;
  return (
    valueToId(lineItem.price) ||
    valueToId(lineItem.plan) ||
    getNestedString(lineItem, ['pricing', 'price_details', 'price'])
  );
};

const getLineItemsData = (source: unknown) => {
  if (!source || typeof source !== 'object' || !('data' in source) || !Array.isArray(source.data)) return [];
  return source.data as Array<Record<string, unknown>>;
};

const getMappedPlanPriceIdFromItems = (items: Array<Record<string, unknown>>) =>
  items.map(getPriceIdFromLineItem).find((priceId): priceId is string => Boolean(priceId && STRIPE_PRICE_MAP[priceId])) ??
  null;

const getPriceIdFromSubscriptionObject = (subscription: Record<string, unknown> | undefined) => {
  if (!subscription) return null;
  return getMappedPlanPriceIdFromItems(getLineItemsData(subscription.items));
};

const getMeterItemIdsFromSubscriptionObject = (subscription: Record<string, unknown> | undefined | null) => {
  const items = getLineItemsData(subscription?.items);
  const findByPrice = (priceId: string) => {
    const item = items.find((candidate) => getPriceIdFromLineItem(candidate) === priceId);
    return valueToId(item);
  };

  return {
    stripeAiMeterItemId: findByPrice(STRIPE_AI_OVERAGE_PRICE_ID),
    stripeWhatsappMeterItemId: findByPrice(STRIPE_WHATSAPP_OVERAGE_PRICE_ID),
  };
};

const getPriceIdFromInvoiceObject = (invoice: Record<string, unknown>) => {
  return getMappedPlanPriceIdFromItems(getLineItemsData(invoice.lines));
};

const getSubscriptionIdFromInvoice = (invoice: Record<string, unknown>) =>
  valueToId(invoice.subscription) ||
  getNestedString(invoice, ['parent', 'subscription_details', 'subscription']) ||
  getNestedString(invoice, ['subscription_details', 'subscription']);

const getRestaurantIdFromSubscriptionObject = (subscription: Record<string, unknown> | null | undefined) => {
  if (!subscription) return null;
  return getMetadataValue(subscription.metadata, 'restaurantId') || getMetadataValue(subscription.metadata, 'restaurant_id');
};

const getRestaurantIdFromInvoiceObject = (invoice: Record<string, unknown>) =>
  getMetadataValue(invoice.metadata, 'restaurantId') ||
  getMetadataValue(invoice.metadata, 'restaurant_id') ||
  getMetadataValue(getNestedRecord(invoice, ['subscription_details', 'metadata']), 'restaurantId') ||
  getMetadataValue(getNestedRecord(invoice, ['subscription_details', 'metadata']), 'restaurant_id') ||
  getMetadataValue(getNestedRecord(invoice, ['parent', 'subscription_details', 'metadata']), 'restaurantId') ||
  getMetadataValue(getNestedRecord(invoice, ['parent', 'subscription_details', 'metadata']), 'restaurant_id');

const getPlanFromPriceId = (priceId: string | null) =>
  priceId ? ((STRIPE_PRICE_MAP[priceId] as Plan | undefined) ?? null) : null;

const isLifetimePlan = (plan: Plan | null | undefined) => plan === 'lifetime' || plan === 'founder_lifetime';

const getPriceIdFromStripeRest = async (sessionId: string) => {
  if (!env.STRIPE_SECRET_KEY) return null;

  const url = new URL(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}/line_items`);
  url.searchParams.set('limit', '10');
  url.searchParams.append('expand[]', 'data.price');

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    },
  });

  if (!response.ok) return null;

  const body = (await response.json()) as { data?: Array<Record<string, unknown>> };
  return getMappedPlanPriceIdFromItems(body.data ?? []);
};

const getSubscriptionFromStripeRest = async (subscriptionId: string) => {
  if (!env.STRIPE_SECRET_KEY) return null;

  const url = new URL(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
  url.searchParams.append('expand[]', 'items.data.price');

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    },
  });

  if (!response.ok) return null;
  return (await response.json()) as Record<string, unknown>;
};

const getPriceIdFromSession = async (session: Record<string, unknown>, stripe: StripeLikeClient | null) => {
  const expandedSubscriptionPrice = getPriceIdFromSubscriptionObject(
    session.subscription && typeof session.subscription === 'object'
      ? (session.subscription as Record<string, unknown>)
      : undefined,
  );
  if (expandedSubscriptionPrice) return expandedSubscriptionPrice;

  const lineItems = session.line_items;
  if (lineItems && typeof lineItems === 'object') {
    const embeddedPrice = getMappedPlanPriceIdFromItems(getLineItemsData(lineItems));
    if (embeddedPrice) return embeddedPrice;
  }

  const sessionId = valueToId(session);
  if (!sessionId) return null;
  if (!stripe?.checkout?.sessions?.listLineItems) return getPriceIdFromStripeRest(sessionId);

  const response = await stripe.checkout.sessions.listLineItems(sessionId, {
    limit: 10,
    expand: ['data.price'],
  });

  return getMappedPlanPriceIdFromItems(response.data ?? []) || getPriceIdFromStripeRest(sessionId);
};

const upsertSubscriptionByRestaurant = async ({
  restaurantId,
  plan,
  status,
  lifetime,
  stripeSubscriptionId,
  stripeCustomerId,
  stripePriceId,
  stripeAiMeterItemId,
  stripeWhatsappMeterItemId,
  expiresAt,
}: {
  restaurantId: string;
  plan: Plan;
  status: SubscriptionStatus;
  lifetime: boolean;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  stripePriceId: string | null;
  stripeAiMeterItemId?: string | null;
  stripeWhatsappMeterItemId?: string | null;
  expiresAt: Date | null;
}) => {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.restaurantId, restaurantId))
      .limit(1);

    const values = {
      provider: 'stripe',
      providerCustomerId: stripeCustomerId,
      providerSubscriptionId: stripeSubscriptionId,
      stripeSubscriptionId,
      stripePriceId,
      plan,
      status,
      lifetime,
      expiresAt,
      updatedAt: new Date(),
    };

    if (existing) {
      await tx.update(subscriptions).set(values).where(eq(subscriptions.id, existing.id));
    } else {
      await tx.insert(subscriptions).values({ restaurantId, ...values });
    }

    await tx
      .update(restaurants)
      .set({
        plan,
        status: status === 'past_due' ? 'past_due' : 'active',
        updatedAt: new Date(),
        ...(stripeAiMeterItemId !== undefined ? { stripeAiMeterItemId } : {}),
        ...(stripeWhatsappMeterItemId !== undefined ? { stripeWhatsappMeterItemId } : {}),
      })
      .where(eq(restaurants.id, restaurantId));
  });
};

const findSubscriptionByStripeId = async (stripeSubscriptionId: string) => {
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(
      or(
        eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId),
        eq(subscriptions.providerSubscriptionId, stripeSubscriptionId),
      ),
    )
    .limit(1);

  return subscription;
};

const handleCheckoutCompleted = async (
  session: Record<string, unknown>,
  stripe: StripeLikeClient | null,
  log: FastifyRequest['log'],
) => {
  log.info(
    { checkoutSessionPresent: Boolean(valueToId(session)), restaurant_sources: getRestaurantDebugSources(session) },
    'Stripe checkout.session.completed fontes de restaurant_id',
  );

  const restaurantId = getRestaurantIdFromSession(session);
  const subscriptionId = valueToId(session.subscription);
  const customerId = valueToId(session.customer);
  if (!restaurantId || !uuidPattern.test(restaurantId)) {
    logStripePlanDebug(log, {
      eventType: 'checkout.session.completed',
      restaurantId: restaurantId ?? null,
      priceId: null,
      plan: null,
      subscriptionId,
      customerId,
      ignoreReason: 'checkout sem restaurantId valido',
    });
    return;
  }

  let priceId = await getPriceIdFromSession(session, stripe);
  let stripeSubscription =
    session.subscription && typeof session.subscription === 'object'
      ? (session.subscription as Record<string, unknown>)
      : null;
  if (subscriptionId && (!priceId || !stripeSubscription)) {
    stripeSubscription = await getSubscriptionFromStripeRest(subscriptionId);
    if (!priceId) priceId = getPriceIdFromSubscriptionObject(stripeSubscription ?? undefined);
  }

  const mappedPlan = getPlanFromPriceId(priceId);
  logStripePlanDebug(log, {
    eventType: 'checkout.session.completed',
    restaurantId,
    priceId,
    plan: mappedPlan ?? null,
    subscriptionId,
    customerId,
  });

  if (!priceId) {
    logStripePlanDebug(log, {
      eventType: 'checkout.session.completed',
      restaurantId,
      priceId: null,
      plan: null,
      subscriptionId,
      customerId,
      ignoreReason: 'checkout sem priceId',
    });
    return;
  }

  if (!mappedPlan) {
    logStripePlanDebug(log, {
      eventType: 'checkout.session.completed',
      restaurantId,
      priceId,
      plan: null,
      subscriptionId,
      customerId,
      ignoreReason: 'priceId sem plano mapeado',
    });
    return;
  }

  const lifetime = isLifetimePlan(mappedPlan);
  const meterItemIds = lifetime
    ? { stripeAiMeterItemId: null, stripeWhatsappMeterItemId: null }
    : getMeterItemIdsFromSubscriptionObject(stripeSubscription);
  await upsertSubscriptionByRestaurant({
    restaurantId,
    plan: mappedPlan,
    status: 'active',
    lifetime,
    stripeSubscriptionId: subscriptionId,
    stripeCustomerId: customerId,
    stripePriceId: priceId,
    ...meterItemIds,
    expiresAt: lifetime ? null : addDays(31),
  });

  log.info({ restaurantId, plan: mappedPlan, priceId }, 'Stripe checkout aplicado com sucesso');
};

const handleInvoicePaymentSucceeded = async (invoice: Record<string, unknown>, log: FastifyRequest['log']) => {
  const stripeSubscriptionId = getSubscriptionIdFromInvoice(invoice);
  const customerId = valueToId(invoice.customer);
  let priceId = getPriceIdFromInvoiceObject(invoice);
  const stripeSubscription = stripeSubscriptionId ? await getSubscriptionFromStripeRest(stripeSubscriptionId) : null;

  if (!priceId) {
    priceId = getPriceIdFromSubscriptionObject(stripeSubscription ?? undefined);
  }

  const mappedPlan = getPlanFromPriceId(priceId);
  if (!stripeSubscriptionId) {
    logStripePlanDebug(log, {
      eventType: 'invoice.payment_succeeded',
      restaurantId: getRestaurantIdFromInvoiceObject(invoice),
      priceId,
      plan: mappedPlan,
      subscriptionId: null,
      customerId,
      ignoreReason: 'invoice sem subscriptionId',
    });
    return;
  }

  const subscription = await findSubscriptionByStripeId(stripeSubscriptionId);
  const restaurantId =
    subscription?.restaurantId ||
    getRestaurantIdFromSubscriptionObject(stripeSubscription) ||
    getRestaurantIdFromInvoiceObject(invoice);

  logStripePlanDebug(log, {
    eventType: 'invoice.payment_succeeded',
    restaurantId,
    priceId,
    plan: mappedPlan ?? null,
    subscriptionId: stripeSubscriptionId,
    customerId,
  });

  if (!restaurantId || !uuidPattern.test(restaurantId)) {
    logStripePlanDebug(log, {
      eventType: 'invoice.payment_succeeded',
      restaurantId: restaurantId ?? null,
      priceId,
      plan: mappedPlan ?? null,
      subscriptionId: stripeSubscriptionId,
      customerId,
      ignoreReason: 'invoice sem restaurantId valido',
    });
    return;
  }

  if (!mappedPlan) {
    logStripePlanDebug(log, {
      eventType: 'invoice.payment_succeeded',
      restaurantId,
      priceId,
      plan: null,
      subscriptionId: stripeSubscriptionId,
      customerId,
      ignoreReason: 'invoice sem priceId mapeado',
    });
    return;
  }

  const nextPlan = mappedPlan;
  const lifetime = isLifetimePlan(nextPlan) || Boolean(subscription?.lifetime);
  const expiresAt = lifetime ? null : addDays(31);
  const meterItemIds = lifetime
    ? { stripeAiMeterItemId: null, stripeWhatsappMeterItemId: null }
    : getMeterItemIdsFromSubscriptionObject(stripeSubscription);
  await upsertSubscriptionByRestaurant({
    restaurantId,
    plan: nextPlan,
    status: 'active',
    lifetime,
    stripeSubscriptionId,
    stripeCustomerId: customerId,
    stripePriceId: priceId,
    ...meterItemIds,
    expiresAt,
  });
};

const handleInvoicePaymentFailed = async (invoice: Record<string, unknown>, log: FastifyRequest['log']) => {
  const stripeSubscriptionId = getSubscriptionIdFromInvoice(invoice);
  const customerId = valueToId(invoice.customer);
  let priceId = getPriceIdFromInvoiceObject(invoice);
  const stripeSubscription = stripeSubscriptionId ? await getSubscriptionFromStripeRest(stripeSubscriptionId) : null;

  if (!priceId) {
    priceId = getPriceIdFromSubscriptionObject(stripeSubscription ?? undefined);
  }

  const mappedPlan = getPlanFromPriceId(priceId);
  if (!stripeSubscriptionId) {
    logStripePlanDebug(log, {
      eventType: 'invoice.payment_failed',
      restaurantId: getRestaurantIdFromInvoiceObject(invoice),
      priceId,
      plan: mappedPlan,
      subscriptionId: null,
      customerId,
      ignoreReason: 'invoice sem subscriptionId',
    });
    return;
  }

  const subscription = await findSubscriptionByStripeId(stripeSubscriptionId);
  const restaurantId =
    subscription?.restaurantId ||
    getRestaurantIdFromSubscriptionObject(stripeSubscription) ||
    getRestaurantIdFromInvoiceObject(invoice);

  logStripePlanDebug(log, {
    eventType: 'invoice.payment_failed',
    restaurantId,
    priceId,
    plan: mappedPlan ?? subscription?.plan ?? null,
    subscriptionId: stripeSubscriptionId,
    customerId,
  });

  if (!restaurantId || !uuidPattern.test(restaurantId)) {
    logStripePlanDebug(log, {
      eventType: 'invoice.payment_failed',
      restaurantId: restaurantId ?? null,
      priceId,
      plan: mappedPlan ?? subscription?.plan ?? null,
      subscriptionId: stripeSubscriptionId,
      customerId,
      ignoreReason: 'invoice sem restaurantId valido',
    });
    return;
  }

  const nextPlan = mappedPlan ?? subscription?.plan;
  if (!nextPlan) {
    logStripePlanDebug(log, {
      eventType: 'invoice.payment_failed',
      restaurantId,
      priceId,
      plan: null,
      subscriptionId: stripeSubscriptionId,
      customerId,
      ignoreReason: 'invoice sem plano atual ou calculado',
    });
    return;
  }

  await upsertSubscriptionByRestaurant({
    restaurantId,
    plan: nextPlan,
    status: 'past_due',
    lifetime: isLifetimePlan(nextPlan) || Boolean(subscription?.lifetime),
    stripeSubscriptionId,
    stripeCustomerId: customerId,
    stripePriceId: priceId ?? subscription?.stripePriceId ?? null,
    ...(isLifetimePlan(nextPlan) || Boolean(subscription?.lifetime)
      ? { stripeAiMeterItemId: null, stripeWhatsappMeterItemId: null }
      : getMeterItemIdsFromSubscriptionObject(stripeSubscription)),
    expiresAt: subscription?.expiresAt ?? null,
  });
};

const handleSubscriptionCreatedOrUpdated = async (
  stripeSubscription: Record<string, unknown>,
  eventType: string,
  log: FastifyRequest['log'],
) => {
  const stripeSubscriptionId = valueToId(stripeSubscription);
  const fetchedSubscription = stripeSubscriptionId ? await getSubscriptionFromStripeRest(stripeSubscriptionId) : null;
  const resolvedSubscription = fetchedSubscription ?? stripeSubscription;
  const customerId = valueToId(resolvedSubscription.customer) ?? valueToId(stripeSubscription.customer);
  const priceId = getPriceIdFromSubscriptionObject(resolvedSubscription);
  const existing = stripeSubscriptionId ? await findSubscriptionByStripeId(stripeSubscriptionId) : undefined;
  const restaurantId =
    existing?.restaurantId ||
    getRestaurantIdFromSubscriptionObject(resolvedSubscription) ||
    getRestaurantIdFromSubscriptionObject(stripeSubscription);

  const mappedPlan = getPlanFromPriceId(priceId);
  logStripePlanDebug(log, {
    eventType,
    restaurantId,
    priceId,
    plan: mappedPlan,
    subscriptionId: stripeSubscriptionId,
    customerId,
  });

  if (!stripeSubscriptionId) {
    logStripePlanDebug(log, {
      eventType,
      restaurantId,
      priceId,
      plan: mappedPlan,
      subscriptionId: null,
      customerId,
      ignoreReason: 'subscription event sem subscriptionId',
    });
    return;
  }

  if (!mappedPlan) {
    logStripePlanDebug(log, {
      eventType,
      restaurantId,
      priceId,
      plan: null,
      subscriptionId: stripeSubscriptionId,
      customerId,
      ignoreReason: 'subscription event sem priceId mapeado',
    });
    return;
  }

  if (!restaurantId || !uuidPattern.test(restaurantId)) {
    logStripePlanDebug(log, {
      eventType,
      restaurantId: restaurantId ?? null,
      priceId,
      plan: mappedPlan,
      subscriptionId: stripeSubscriptionId,
      customerId,
      ignoreReason: 'subscription event sem restaurantId valido',
    });
    return;
  }

  const lifetime = isLifetimePlan(mappedPlan);
  const meterItemIds = lifetime
    ? { stripeAiMeterItemId: null, stripeWhatsappMeterItemId: null }
    : getMeterItemIdsFromSubscriptionObject(resolvedSubscription);
  await upsertSubscriptionByRestaurant({
    restaurantId,
    plan: mappedPlan,
    status: getStripeStatus(resolvedSubscription.status),
    lifetime,
    stripeSubscriptionId,
    stripeCustomerId: customerId,
    stripePriceId: priceId,
    ...meterItemIds,
    expiresAt: lifetime ? null : addDays(31),
  });
};

const handleSubscriptionDeleted = async (stripeSubscription: Record<string, unknown>, log: FastifyRequest['log']) => {
  const stripeSubscriptionId = valueToId(stripeSubscription);
  const customerId = valueToId(stripeSubscription.customer);
  const priceId = getPriceIdFromSubscriptionObject(stripeSubscription);
  const mappedPlan = getPlanFromPriceId(priceId);
  const subscription = stripeSubscriptionId ? await findSubscriptionByStripeId(stripeSubscriptionId) : undefined;
  const restaurantId = subscription?.restaurantId || getRestaurantIdFromSubscriptionObject(stripeSubscription);
  logStripePlanDebug(log, {
    eventType: 'customer.subscription.deleted',
    restaurantId,
    priceId,
    plan: mappedPlan,
    subscriptionId: stripeSubscriptionId,
    customerId,
  });

  if (!stripeSubscriptionId) {
    logStripePlanDebug(log, {
      eventType: 'customer.subscription.deleted',
      restaurantId,
      priceId,
      plan: mappedPlan,
      subscriptionId: null,
      customerId,
      ignoreReason: 'subscription.deleted sem subscriptionId',
    });
    return;
  }

  if (!restaurantId || !uuidPattern.test(restaurantId)) {
    logStripePlanDebug(log, {
      eventType: 'customer.subscription.deleted',
      restaurantId: restaurantId ?? null,
      priceId,
      plan: mappedPlan,
      subscriptionId: stripeSubscriptionId,
      customerId,
      ignoreReason: 'subscription.deleted sem restaurantId valido',
    });
    return;
  }

  await upsertSubscriptionByRestaurant({
    restaurantId,
    plan: 'free',
    status: 'canceled',
    lifetime: false,
    stripeSubscriptionId,
    stripeCustomerId: customerId,
    stripePriceId: priceId ?? subscription?.stripePriceId ?? null,
    stripeAiMeterItemId: null,
    stripeWhatsappMeterItemId: null,
    expiresAt: null,
  });
};

const startStripeEventProcessing = async (event: StripeEvent) => {
  if (!event.id) return true;

  const [inserted] = await db
    .insert(stripeWebhookEvents)
    .values({ eventId: event.id, eventType: event.type, status: 'processing' })
    .onConflictDoNothing()
    .returning({ eventId: stripeWebhookEvents.eventId });

  return Boolean(inserted);
};

const finishStripeEventProcessing = async (event: StripeEvent, status: 'processed' | 'ignored' | 'failed', error?: string) => {
  if (!event.id) return;

  await db
    .update(stripeWebhookEvents)
    .set({
      status,
      error: error ? error.slice(0, 500) : null,
      processedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(stripeWebhookEvents.eventId, event.id));
};

export const stripeWebhookRoute = async (app: FastifyInstance) => {
  app.post('/webhooks/stripe', { config: { rateLimit: { max: 100, timeWindow: '1 minute' } } }, async (request, reply) => {
    let eventType = 'unknown';
    let currentEvent: StripeEvent | null = null;
    try {
      const { event, stripe } = await constructStripeEvent(request);
      currentEvent = event;
      eventType = event.type;
      const object = event.data.object;
      request.log.info({ eventType: event.type }, 'Stripe webhook recebido');

      const shouldProcess = await startStripeEventProcessing(event);
      if (!shouldProcess) {
        request.log.info({ eventType: event.type }, 'Stripe webhook duplicado ignorado');
        return reply.code(200).send({ received: true, duplicate: true });
      }

      if (event.type === 'checkout.session.completed') {
        await handleCheckoutCompleted(object, stripe, request.log);
      }

      if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
        await handleSubscriptionCreatedOrUpdated(object, event.type, request.log);
      }

      if (event.type === 'invoice.payment_succeeded') {
        await handleInvoicePaymentSucceeded(object, request.log);
      }

      if (event.type === 'invoice.payment_failed') {
        await handleInvoicePaymentFailed(object, request.log);
      }

      if (event.type === 'customer.subscription.deleted') {
        await handleSubscriptionDeleted(object, request.log);
      }

      await finishStripeEventProcessing(event, 'processed');
    } catch (error) {
      const reason = redactSensitiveText(error instanceof Error ? error.message : 'erro desconhecido');
      request.log.warn({ eventType, err: safeErrorForLog(error) }, 'Stripe webhook ignorado');
      logDevelopmentOnly('[stripe webhook ignorado]', { eventType, err: safeErrorForLog(error) });
      if (currentEvent) await finishStripeEventProcessing(currentEvent, 'failed', reason);
    }

    return reply.code(200).send({ received: true });
  });
};
