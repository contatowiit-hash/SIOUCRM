import type { FastifyInstance, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  STRIPE_AI_OVERAGE_PRICE_ID,
  STRIPE_FOUNDER_LIFETIME_PRICE_ID,
  STRIPE_LIFETIME_PRICE_ID,
  STRIPE_PRICE_MAP,
  STRIPE_PLUS_PRICE_ID,
  STRIPE_PREMIUM_PRICE_ID,
  STRIPE_PRO_PRICE_ID,
  STRIPE_WHATSAPP_OVERAGE_PRICE_ID,
} from '../config/stripe-plans.js';
import { db } from '../db/client.js';
import { restaurants, subscriptions } from '../db/schema.js';
import { env } from '../env.js';
import { requireRoles } from '../plugins/auth.js';
import { toRestaurantDto } from '../utils/format.js';

const CheckoutSchema = z.object({
  plan: z.enum(['plus', 'pro', 'premium', 'lifetime', 'founder_lifetime']),
});

const ConfirmSessionSchema = z.object({
  session_id: z.string().min(8).max(255),
});

const checkoutPriceByPlan = {
  plus: STRIPE_PLUS_PRICE_ID,
  pro: STRIPE_PRO_PRICE_ID,
  premium: STRIPE_PREMIUM_PRICE_ID,
  lifetime: STRIPE_LIFETIME_PRICE_ID,
  founder_lifetime: STRIPE_FOUNDER_LIFETIME_PRICE_ID,
} as const;

class CheckoutPublicError extends Error {
  constructor(
    public readonly publicMessage: string,
    public readonly statusCode: number,
    public readonly logData: Record<string, unknown> = {},
  ) {
    super(publicMessage);
    this.name = 'CheckoutPublicError';
  }
}

const trustedCheckoutOrigins = new Set([new URL(env.APP_URL).origin, 'https://www.sioucrm.com', 'https://sioucrm.com']);
if (env.NODE_ENV !== 'production') {
  trustedCheckoutOrigins.add('http://127.0.0.1:5174');
  trustedCheckoutOrigins.add('http://localhost:5174');
}

const firstHeaderValue = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim();

const trustedOrigin = (value: string | null | undefined) => {
  if (!value) return null;
  try {
    const origin = new URL(value).origin;
    return trustedCheckoutOrigins.has(origin) ? origin : null;
  } catch {
    return null;
  }
};

const checkoutAppUrl = (request: FastifyRequest) => {
  const origin = trustedOrigin(firstHeaderValue(request.headers.origin));
  if (origin) return origin;

  const host = firstHeaderValue(request.headers['x-forwarded-host']) ?? firstHeaderValue(request.headers.host);
  const protocol = firstHeaderValue(request.headers['x-forwarded-proto']) ?? (request.protocol || 'http');
  const requestUrl = host ? trustedOrigin(`${protocol}://${host}`) : null;
  return requestUrl ?? new URL(env.APP_URL).origin;
};

let overagePriceValidationCache: { checkedAt: number; valid: boolean } | null = null;

const isAvailableMeteredPrice = async (priceId: string) => {
  if (!env.STRIPE_SECRET_KEY) return false;

  const response = await fetch(`https://api.stripe.com/v1/prices/${encodeURIComponent(priceId)}`, {
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
  });
  if (!response.ok) return false;

  const price = (await response.json().catch(() => null)) as
    | { active?: boolean; recurring?: { meter?: unknown; usage_type?: unknown } }
    | null;
  return Boolean(
    price?.active && price.recurring && (price.recurring.meter || price.recurring.usage_type === 'metered'),
  );
};

const hasValidOveragePrices = async () => {
  if (overagePriceValidationCache && Date.now() - overagePriceValidationCache.checkedAt < 5 * 60 * 1000) {
    return overagePriceValidationCache.valid;
  }

  const valid = await Promise.all([
    isAvailableMeteredPrice(STRIPE_WHATSAPP_OVERAGE_PRICE_ID),
    isAvailableMeteredPrice(STRIPE_AI_OVERAGE_PRICE_ID),
  ])
    .then((results) => results.every(Boolean))
    .catch(() => false);
  overagePriceValidationCache = { checkedAt: Date.now(), valid };
  return valid;
};

const addSubscriptionOveragePrices = async (body: URLSearchParams) => {
  if (!(await hasValidOveragePrices())) return false;
  body.set('line_items[1][price]', STRIPE_WHATSAPP_OVERAGE_PRICE_ID);
  body.set('line_items[2][price]', STRIPE_AI_OVERAGE_PRICE_ID);
  return true;
};

const createCheckoutSession = async ({
  restaurantId,
  email,
  plan,
  appUrl,
}: {
  restaurantId: string;
  email: string;
  plan: keyof typeof checkoutPriceByPlan;
  appUrl: string;
}) => {
  if (!env.STRIPE_SECRET_KEY) {
    throw new CheckoutPublicError('Cobrança do Stripe não configurada no servidor.', 503, { reason: 'missing_stripe_secret' });
  }

  const mode = plan === 'lifetime' || plan === 'founder_lifetime' ? 'payment' : 'subscription';
  const planPriceId = checkoutPriceByPlan[plan];
  if (!planPriceId?.startsWith('price_')) {
    throw new CheckoutPublicError('Este plano ainda não está configurado no Stripe.', 503, { reason: 'invalid_plan_price' });
  }

  const body = new URLSearchParams({
    mode,
    client_reference_id: restaurantId,
    customer_email: email,
    success_url: `${appUrl}/app/planos?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/app/planos?checkout=cancelled`,
    'line_items[0][price]': planPriceId,
    'line_items[0][quantity]': '1',
    'metadata[restaurantId]': restaurantId,
    'metadata[restaurant_id]': restaurantId,
    'metadata[plan]': plan,
  });

  let meteredBillingEnabled = false;
  if (mode === 'subscription') {
    meteredBillingEnabled = await addSubscriptionOveragePrices(body);
    body.set('subscription_data[metadata][restaurantId]', restaurantId);
    body.set('subscription_data[metadata][restaurant_id]', restaurantId);
    body.set('subscription_data[metadata][plan]', plan);
  } else {
    body.set('payment_intent_data[metadata][restaurantId]', restaurantId);
    body.set('payment_intent_data[metadata][restaurant_id]', restaurantId);
    body.set('payment_intent_data[metadata][plan]', plan);
  }

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const data = (await response.json()) as {
    id?: string;
    url?: string;
    error?: { code?: string; message?: string; param?: string; type?: string };
  };
  if (!response.ok || !data.url) {
    const stripeCode = data.error?.code ?? data.error?.type ?? `stripe_http_${response.status}`;
    const stripeParam = data.error?.param ?? null;
    const resourceMissing = data.error?.code === 'resource_missing' || /No such price/i.test(data.error?.message ?? '');
    throw new CheckoutPublicError(
      resourceMissing
        ? 'Este plano não foi encontrado no Stripe. Verifique os IDs dos preços no servidor.'
        : 'Não foi possível abrir o checkout agora. Tente novamente em alguns instantes.',
      resourceMissing ? 503 : 502,
      { reason: 'stripe_checkout_rejected', stripeStatus: response.status, stripeCode, stripeParam },
    );
  }

  return { ...data, meteredBillingEnabled };
};

const valueToId = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') return value.id;
  return null;
};

const getMetadataValue = (source: unknown, key: string) => {
  if (!source || typeof source !== 'object' || !(key in source)) return null;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' ? value.trim() : null;
};

const getPriceIdFromLineItem = (lineItem: Record<string, unknown> | undefined) => {
  if (!lineItem) return null;
  return valueToId(lineItem.price) || valueToId(lineItem.plan);
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

const getMeterItemIdsFromSubscriptionObject = (subscription: Record<string, unknown> | undefined) => {
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

const getPriceIdFromSessionObject = (session: Record<string, unknown>) => {
  const lineItems = session.line_items;
  if (lineItems && typeof lineItems === 'object') {
    const priceId = getMappedPlanPriceIdFromItems(getLineItemsData(lineItems));
    if (priceId) return priceId;
  }

  return getPriceIdFromSubscriptionObject(
    session.subscription && typeof session.subscription === 'object'
      ? (session.subscription as Record<string, unknown>)
      : undefined,
  );
};

const getRestaurantIdFromSession = (session: Record<string, unknown>) =>
  getMetadataValue(session.metadata, 'restaurantId') ||
  getMetadataValue(session.metadata, 'restaurant_id') ||
  (typeof session.client_reference_id === 'string' ? session.client_reference_id.trim() : null);

const retrieveCheckoutSession = async (sessionId: string) => {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('Stripe nao configurado');
  }

  const url = new URL(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
  url.searchParams.append('expand[]', 'line_items.data.price');
  url.searchParams.append('expand[]', 'subscription.items.data.price');

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    },
  });

  const data = (await response.json()) as Record<string, unknown> & {
    error?: { message?: string };
  };

  if (!response.ok || data.error) {
    throw new Error(data.error?.message || 'Nao foi possivel confirmar a sessao do Stripe');
  }

  return data;
};

const upsertSubscriptionFromSession = async ({
  restaurantId,
  session,
  plan,
  priceId,
}: {
  restaurantId: string;
  session: Record<string, unknown>;
  plan: typeof subscriptions.$inferInsert.plan;
  priceId: string | null;
}) => {
  const lifetime = plan === 'lifetime' || plan === 'founder_lifetime';
  const stripeSubscriptionId = valueToId(session.subscription);
  const stripeCustomerId = valueToId(session.customer);
  const subscriptionObject =
    session.subscription && typeof session.subscription === 'object'
      ? (session.subscription as Record<string, unknown>)
      : undefined;
  const meterItemIds = lifetime
    ? { stripeAiMeterItemId: null, stripeWhatsappMeterItemId: null }
    : getMeterItemIdsFromSubscriptionObject(subscriptionObject);
  const expiresAt = lifetime ? null : new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);

  return db.transaction(async (tx) => {
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
      stripePriceId: priceId,
      plan,
      status: 'active' as const,
      lifetime,
      expiresAt,
      updatedAt: new Date(),
    };

    if (existing) {
      await tx.update(subscriptions).set(values).where(eq(subscriptions.id, existing.id));
    } else {
      await tx.insert(subscriptions).values({ restaurantId, ...values });
    }

    const [restaurant] = await tx
      .update(restaurants)
      .set({
        plan,
        status: 'active',
        updatedAt: new Date(),
        ...(meterItemIds.stripeAiMeterItemId || lifetime
          ? { stripeAiMeterItemId: meterItemIds.stripeAiMeterItemId }
          : {}),
        ...(meterItemIds.stripeWhatsappMeterItemId || lifetime
          ? { stripeWhatsappMeterItemId: meterItemIds.stripeWhatsappMeterItemId }
          : {}),
      })
      .where(eq(restaurants.id, restaurantId))
      .returning();

    return restaurant;
  });
};


export const billingRoutes = async (app: FastifyInstance) => {
  app.post(
    '/billing/checkout',
    { preHandler: [app.authenticate, requireRoles('owner')], config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
    const parsed = CheckoutSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Plano invalido.' });
    }

    const auth = request.auth!;
    try {
      const session = await createCheckoutSession({
        restaurantId: auth.restaurantId,
        email: auth.email,
        plan: parsed.data.plan,
        appUrl: checkoutAppUrl(request),
      });

      if (!session.meteredBillingEnabled && parsed.data.plan !== 'lifetime' && parsed.data.plan !== 'founder_lifetime') {
        request.log.warn(
          { restaurantId: auth.restaurantId, plan: parsed.data.plan },
          'Stripe metered prices unavailable; checkout created without overage items',
        );
      }

      request.log.info(
        {
          restaurantId: auth.restaurantId,
          plan: parsed.data.plan,
          meteredBillingEnabled: session.meteredBillingEnabled,
        },
        'Stripe checkout criado e retornado pela rota /api/billing/checkout',
      );

      return reply.send({
        url: session.url,
        session_id: session.id,
        ...(env.NODE_ENV === 'development'
          ? {
              plan: parsed.data.plan,
    
            }
          : {}),
      });
    } catch (error) {
      const checkoutError = error instanceof CheckoutPublicError ? error : null;
      request.log.warn(
        {
          restaurantId: auth.restaurantId,
          plan: parsed.data.plan,
          ...(checkoutError?.logData ?? { reason: 'unexpected_checkout_error' }),
        },
        'Stripe checkout nao criado',
      );

      return reply.code(checkoutError?.statusCode ?? 502).send({
        error: checkoutError?.publicMessage ?? 'Não foi possível abrir o checkout agora. Tente novamente em alguns instantes.',

      });
    }
    },
  );

  app.post(
    '/billing/confirm-session',
    { preHandler: [app.authenticate, requireRoles('owner')], config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = ConfirmSessionSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'Sessao do checkout invalida.' });

      const auth = request.auth!;
      try {
        const session = await retrieveCheckoutSession(parsed.data.session_id);
        const restaurantId = getRestaurantIdFromSession(session);
        if (restaurantId !== auth.restaurantId) {
          return reply.code(403).send({ error: 'Este checkout nao pertence ao restaurante logado.' });
        }

        const paymentStatus = typeof session.payment_status === 'string' ? session.payment_status : null;
        const status = typeof session.status === 'string' ? session.status : null;
        if (status !== 'complete' && paymentStatus !== 'paid') {
          return reply.code(409).send({ error: 'Pagamento ainda nao confirmado pelo Stripe.' });
        }

        const priceId = getPriceIdFromSessionObject(session);
        const plan = (priceId ? STRIPE_PRICE_MAP[priceId] : null) || getMetadataValue(session.metadata, 'plan');
        if (!plan || !(plan in checkoutPriceByPlan)) {
          return reply.code(409).send({ error: 'Nao foi possivel identificar o plano comprado.' });
        }

        const restaurant = await upsertSubscriptionFromSession({
          restaurantId: auth.restaurantId,
          session,
          plan: plan as typeof subscriptions.$inferInsert.plan,
          priceId,
        });

        return reply.send({ restaurant: toRestaurantDto(restaurant), plan });
      } catch {
  
        request.log.warn({ restaurantId: auth.restaurantId }, 'Sessao Stripe nao confirmada');
        return reply.code(502).send({
          error: 'Nao foi possivel confirmar seu plano agora.',
  
        });
      }
    },
  );
};
