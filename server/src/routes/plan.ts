import type { FastifyInstance } from 'fastify';
import { and, count, eq, gte, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  orders,
  planUsage,
  reservations,
  restaurants,
  whatsappConversations,
  whatsappMessages,
} from '../db/schema.js';
import { requireRoles } from '../plugins/auth.js';

const PLAN_LIMITS: Record<string, number | null> = {
  free: 0,
  plus: 1_000,
  starter: 1_000,
  pro: 5_000,
  premium: 20_000,
  lifetime: null,
  founder_lifetime: null,
};

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  plus: 'Plus',
  starter: 'Plus',
  pro: 'Pro',
  premium: 'Premium',
  lifetime: 'Vitalício',
  founder_lifetime: 'Founder',
};

const ADDITIONAL_CONVERSATION_PRICE = 0.06;

const firstOfMonth = (date = new Date()) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
const firstOfNextMonth = (date = new Date()) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));

const countValue = (value: unknown) => Number(value ?? 0);

export const planRoutes = async (app: FastifyInstance) => {
  app.get(
    '/plan/current',
    { preHandler: [app.authenticate, requireRoles('owner', 'admin', 'manager', 'agent')] },
    async (request, reply) => {
      const auth = request.auth!;
      const periodStart = firstOfMonth();
      const periodEnd = firstOfNextMonth();
      const periodStartDate = periodStart.toISOString().slice(0, 10);
      const periodEndDate = periodEnd.toISOString().slice(0, 10);

      const [restaurant] = await db
        .select({ plan: restaurants.plan })
        .from(restaurants)
        .where(and(eq(restaurants.id, auth.restaurantId), eq(restaurants.isDeleted, false)))
        .limit(1);

      if (!restaurant) return reply.code(404).send({ error: 'Restaurante não encontrado.' });

      const [
        [conversationRow],
        [automaticRepliesRow],
        [reservationsRow],
        [ordersRow],
      ] = await Promise.all([
        db
          .select({ total: count() })
          .from(whatsappConversations)
          .where(
            and(
              eq(whatsappConversations.restaurantId, auth.restaurantId),
              eq(whatsappConversations.isDeleted, false),
              gte(whatsappConversations.lastMessageAt, periodStart),
              lt(whatsappConversations.lastMessageAt, periodEnd),
            ),
          ),
        db
          .select({ total: count() })
          .from(whatsappMessages)
          .where(
            and(
              eq(whatsappMessages.restaurantId, auth.restaurantId),
              eq(whatsappMessages.provider, 'groq_ai'),
              gte(whatsappMessages.createdAt, periodStart),
              lt(whatsappMessages.createdAt, periodEnd),
            ),
          ),
        db
          .select({ total: count() })
          .from(reservations)
          .where(
            and(
              eq(reservations.restaurantId, auth.restaurantId),
              eq(reservations.isDeleted, false),
              gte(reservations.reservationDate, periodStartDate),
              lt(reservations.reservationDate, periodEndDate),
            ),
          ),
        db
          .select({ total: count() })
          .from(orders)
          .where(
            and(
              eq(orders.restaurantId, auth.restaurantId),
              eq(orders.isDeleted, false),
              gte(orders.orderDate, periodStart),
              lt(orders.orderDate, periodEnd),
            ),
          ),
      ]);

      const conversationsUsed = countValue(conversationRow?.total);
      const monthlyLimit = PLAN_LIMITS[restaurant.plan] ?? 0;
      const conversationsRemaining = monthlyLimit === null ? null : Math.max(0, monthlyLimit - conversationsUsed);
      const additionalUsage = monthlyLimit === null ? 0 : Math.max(0, conversationsUsed - monthlyLimit);
      const estimatedAdditionalAmount = Number((additionalUsage * ADDITIONAL_CONVERSATION_PRICE).toFixed(2));
      const ratio = monthlyLimit === null ? 0 : monthlyLimit > 0 ? conversationsUsed / monthlyLimit : conversationsUsed > 0 ? 1 : 0;
      const status = ratio >= 1 ? 'exceeded' : ratio >= 0.8 ? 'attention' : 'within_plan';
      const usageLevel =
        ratio >= 1 ? 'Limite ultrapassado' : ratio >= 0.8 ? 'Próximo do limite' : ratio >= 0.4 ? 'Uso moderado' : 'Pouco uso';
      const categories = {
        whatsapp_conversations: conversationsUsed,
        automatic_replies: countValue(automaticRepliesRow?.total),
        reservations: countValue(reservationsRow?.total),
        orders: countValue(ordersRow?.total),
      };

      db.insert(planUsage)
        .values({
          restaurantId: auth.restaurantId,
          periodStart,
          periodEnd,
          plan: restaurant.plan,
          monthlyLimit,
          conversationsUsed,
          conversationsRemaining,
          additionalUsage,
          estimatedAdditionalAmount: estimatedAdditionalAmount.toFixed(2),
          categories,
        })
        .onConflictDoUpdate({
          target: [planUsage.restaurantId, planUsage.periodStart],
          set: {
            periodEnd,
            plan: restaurant.plan,
            monthlyLimit,
            conversationsUsed,
            conversationsRemaining,
            additionalUsage,
            estimatedAdditionalAmount: estimatedAdditionalAmount.toFixed(2),
            categories,
            updatedAt: new Date(),
          },
        })
        .catch((error) => request.log.warn({ err: error, restaurantId: auth.restaurantId }, 'plan usage snapshot not saved'));

      const financialsVisible = auth.role === 'owner';

      return {
        status,
        usage_level: usageLevel,
        financials_visible: financialsVisible,
        plan: {
          id: restaurant.plan,
          name: PLAN_LABELS[restaurant.plan] ?? restaurant.plan,
          monthly_limit: monthlyLimit,
        },
        usage: {
          conversations_used: conversationsUsed,
          conversations_remaining: conversationsRemaining,
          additional_usage: additionalUsage,
          progress: monthlyLimit === null ? 0 : Math.min(100, Math.round(ratio * 100)),
          categories,
        },
        billing: {
          will_pay_extra: financialsVisible ? additionalUsage > 0 : null,
          estimated_additional_amount: financialsVisible ? estimatedAdditionalAmount : null,
        },
        period: {
          start: periodStart.toISOString(),
          end: periodEnd.toISOString(),
        },
      };
    },
  );
};
