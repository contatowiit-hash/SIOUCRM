import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { subscriptions } from '../db/schema.js';
import { PLAN_HIERARCHY } from '../config/stripe-plans.js';

const getPlanLevel = (plan: string) => PLAN_HIERARCHY[plan] ?? PLAN_HIERARCHY.free;

export const requirePlan = (minPlan: string): preHandlerHookHandler => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.auth) {
      const authenticate = request.server.authenticate as (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
      await authenticate(request, reply);
      if (reply.sent) return;
    }

    const auth = request.auth;
    if (!auth?.restaurantId) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.restaurantId, auth.restaurantId))
      .limit(1);

    const currentPlan = subscription?.plan ?? 'free';

    if (subscription && subscription.status !== 'active') {
      return reply.code(403).send({ error: 'Seu plano não está ativo.' });
    }

    if (subscription && !subscription.lifetime && subscription.expiresAt && subscription.expiresAt < new Date()) {
      return reply.code(403).send({ error: 'Seu plano expirou.' });
    }

    if (getPlanLevel(currentPlan) < getPlanLevel(minPlan)) {
      return reply.code(403).send({ error: 'Seu plano atual não libera este recurso.' });
    }
  };
};
