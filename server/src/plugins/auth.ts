import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { restaurants, users } from '../db/schema.js';
import { verifyAccessToken } from '../utils/tokens.js';

export type UserRole = 'owner' | 'admin' | 'manager' | 'agent';

export interface AuthContext {
  userId: string;
  restaurantId: string;
  role: UserRole;
  email: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

export const authPlugin = async (app: FastifyInstance) => {
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    try {
      const token = header.slice('Bearer '.length);
      const auth = await verifyAccessToken(token);
      const [user] = await db
        .select({
          id: users.id,
          restaurantId: users.restaurantId,
          role: users.role,
          isDeleted: users.isDeleted,
          restaurantStatus: restaurants.status,
        })
        .from(users)
        .innerJoin(restaurants, eq(users.restaurantId, restaurants.id))
        .where(eq(users.id, auth.userId))
        .limit(1);

      if (!user || user.isDeleted || user.restaurantId !== auth.restaurantId || user.restaurantStatus === 'cancelled') {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      request.auth = {
        ...auth,
        role: user.role as UserRole,
      };
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });
};

export const requireAuth: preHandlerHookHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const authenticate = request.server.authenticate as (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  await authenticate(request, reply);
};

export const requireRoles =
  (...allowedRoles: UserRole[]): preHandlerHookHandler =>
  async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.auth) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    if (!allowedRoles.includes(request.auth.role)) {
      request.log.warn(
        { userId: request.auth.userId, restaurantId: request.auth.restaurantId, role: request.auth.role },
        'rbac access denied',
      );
      return reply.code(403).send({ error: 'Forbidden' });
    }
  };

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
