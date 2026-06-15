import type { FastifyInstance } from 'fastify';
import { getUsageBillingSummary } from '../services/usage.js';
import { env } from '../env.js';
import { requireRoles } from '../plugins/auth.js';

const centsToReais = (value: unknown) => {
  const amount = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isFinite(amount)) return 0;
  return Number((amount / 100).toFixed(2));
};

const toIsoFromUnix = (value: unknown) => {
  const timestamp = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  return new Date(timestamp * 1000).toISOString();
};

const fetchStripeBillingPreview = async (customerId: string | null | undefined) => {
  const emptyPreview = { next_charge_date: null, next_charge_estimate: null, previous_charges: [] };
  if (!env.STRIPE_SECRET_KEY || !customerId) {
    return emptyPreview;
  }

  try {
    const invoicesUrl = new URL('https://api.stripe.com/v1/invoices');
    invoicesUrl.searchParams.set('customer', customerId);
    invoicesUrl.searchParams.set('limit', '6');

    const headers = { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` };
    const [invoicesResponse, upcomingResponse] = await Promise.all([
      fetch(invoicesUrl, { headers }),
      fetch(`https://api.stripe.com/v1/invoices/upcoming?customer=${encodeURIComponent(customerId)}`, { headers }).catch(
        () => null,
      ),
    ]);

    const invoicesBody = invoicesResponse.ok
      ? ((await invoicesResponse.json().catch(() => null)) as { data?: Array<Record<string, unknown>> } | null)
      : null;
    const upcomingBody = upcomingResponse?.ok
      ? ((await upcomingResponse.json().catch(() => null)) as Record<string, unknown> | null)
      : null;

    return {
      next_charge_date: toIsoFromUnix(upcomingBody?.next_payment_attempt ?? upcomingBody?.due_date),
      next_charge_estimate: upcomingBody ? centsToReais(upcomingBody.amount_due) : null,
      previous_charges:
        invoicesBody?.data?.slice(0, 6).map((invoice) => ({
          date: toIsoFromUnix(invoice.created),
          amount: centsToReais(invoice.amount_paid ?? invoice.amount_due),
          status: typeof invoice.status === 'string' ? invoice.status : null,
        })) ?? [],
    };
  } catch {
    return emptyPreview;
  }
};

export const usageRoutes = async (app: FastifyInstance) => {
  app.get(
    '/usage/current',
    { preHandler: [app.authenticate, requireRoles('owner', 'admin', 'manager', 'agent')] },
    async (request, reply) => {
      const auth = request.auth!;
      const financialsVisible = auth.role === 'owner';
      const summary = await getUsageBillingSummary(auth.restaurantId, financialsVisible);

      if (!summary) return reply.code(404).send({ error: 'Restaurante nao encontrado.' });
      const { stripe_customer_id: stripeCustomerId, ...publicSummary } = summary;

      if (!financialsVisible) {
        return {
          ...publicSummary,
          billing: {
            ...publicSummary.billing,
            next_charge_date: null,
            next_charge_estimate: null,
            previous_charges: [],
          },
        };
      }

      const stripeBilling = await fetchStripeBillingPreview(stripeCustomerId);

      return {
        ...publicSummary,
        billing: {
          ...publicSummary.billing,
          ...stripeBilling,
        },
      };
    },
  );
};
