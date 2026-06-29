import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { refreshSessions, restaurants, users } from '../db/schema.js';
import { env } from '../env.js';
import { LoginSchema, RegisterSchema } from '../schemas.js';
import { toRestaurantDto, toUserDto } from '../utils/format.js';
import { isDeveloperEmail, isDeveloperPassword } from '../utils/developer.js';
import { getIp, hashPassword, randomToken, sanitizeText, sha256, slugify, verifyPassword } from '../utils/security.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/tokens.js';
import { writeAuditLog } from '../utils/audit.js';

const refreshCookieName = 'syntra_refresh';
const refreshSessionTtlDays = 30;
const refreshSessionTtlMs = refreshSessionTtlDays * 24 * 60 * 60 * 1000;
const refreshSessionTtlSeconds = Math.floor(refreshSessionTtlMs / 1000);

const firstHeaderValue = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim();

const isHttpsRequest = (request: FastifyRequest) => {
  const protocol = firstHeaderValue(request.headers['x-forwarded-proto']) ?? request.protocol;
  return protocol === 'https';
};

const refreshCookieOptions = (request: FastifyRequest) => ({
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.NODE_ENV === 'production' || isHttpsRequest(request),
  priority: 'high' as const,
  maxAge: refreshSessionTtlSeconds,
});

const clearRefreshCookie = (request: FastifyRequest, reply: FastifyReply) => {
  const options = refreshCookieOptions(request);
  return reply.clearCookie(refreshCookieName, {
    path: options.path,
    httpOnly: options.httpOnly,
    sameSite: options.sameSite,
    secure: options.secure,
    priority: options.priority,
  });
};

const trustedBrowserOrigins = new Set([new URL(env.APP_URL).origin]);
trustedBrowserOrigins.add('https://www.sioucrm.com');
trustedBrowserOrigins.add('https://sioucrm.com');
if (env.NODE_ENV !== 'production') {
  trustedBrowserOrigins.add('http://127.0.0.1:5174');
  trustedBrowserOrigins.add('http://localhost:5174');
}

const requestOrigin = (request: FastifyRequest) => {
  const host = firstHeaderValue(request.headers['x-forwarded-host']) ?? firstHeaderValue(request.headers.host);
  const protocol = firstHeaderValue(request.headers['x-forwarded-proto']) ?? (request.protocol || 'http');
  return host ? `${protocol}://${host}` : null;
};

const requireTrustedBrowserOrigin: preHandlerHookHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const origin = request.headers.origin;
  if (origin) {
    try {
      const normalizedOrigin = new URL(origin).origin;
      if (!trustedBrowserOrigins.has(normalizedOrigin) && normalizedOrigin !== requestOrigin(request)) {
        return reply.code(403).send({ error: 'Forbidden' });
      }
      return;
    } catch {
      return reply.code(403).send({ error: 'Forbidden' });
    }
  }

  const secFetchSite = request.headers['sec-fetch-site'];
  if (secFetchSite === 'cross-site') {
    return reply.code(403).send({ error: 'Forbidden' });
  }
};

const registerExistingAccountMessage =
  'Esse email ja tem uma conta. Entre no painel ou use recuperar senha.';

const issueTokens = async ({
  user,
  request,
}: {
  user: typeof users.$inferSelect;
  request: FastifyRequest;
}) => {
  const accessToken = await signAccessToken({
    sub: user.id,
    restaurantId: user.restaurantId,
    role: user.role,
    email: user.email,
  });
  const rawRefresh = randomToken();
  const expiresAt = new Date(Date.now() + refreshSessionTtlMs);
  const [session] = await db
    .insert(refreshSessions)
    .values({
      restaurantId: user.restaurantId,
      userId: user.id,
      tokenHash: sha256(rawRefresh),
      userAgent: request.headers['user-agent'],
      ipAddress: getIp(request.headers),
      expiresAt,
    })
    .returning();
  const refreshToken = await signRefreshToken(session.id, user.id);
  return { accessToken, refreshToken: `${refreshToken}.${rawRefresh}` };
};

export const authRoutes = async (app: FastifyInstance) => {
  app.post('/auth/register', { preHandler: requireTrustedBrowserOrigin, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = RegisterSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Dados invalidos' });

    const input = parsed.data;
    const email = input.email.toLowerCase();
    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing && !existing.isDeleted) {
      return reply.code(409).send({ error: registerExistingAccountMessage });
    }

    const restaurantSlug = `${slugify(input.restaurantName) || 'restaurante'}-${crypto.randomUUID().slice(0, 8)}`;
    const passwordHash = await hashPassword(input.password);

    const result = await db.transaction(async (tx) => {
      const [restaurant] = await tx
        .insert(restaurants)
        .values({
          name: sanitizeText(input.restaurantName, 120),
          slug: restaurantSlug,
          plan: 'free',
          status: 'active',
        })
        .returning();

      const [createdUser] = await tx
        .insert(users)
        .values({
          restaurantId: restaurant.id,
          fullName: sanitizeText(input.fullName, 100),
          email,
          passwordHash,
          role: 'owner',
          emailVerifiedAt: new Date(),
        })
        .returning();

      return { restaurant, user: createdUser };
    });

    await writeAuditLog({
      request,
      restaurantId: result.restaurant.id,
      userId: result.user.id,
      action: 'auth_register',
      resourceType: 'user',
      resourceId: result.user.id,
      newData: { email, restaurant: result.restaurant.name },
    });

    const tokens = await issueTokens({ user: result.user, request });
    reply.setCookie(refreshCookieName, tokens.refreshToken, refreshCookieOptions(request));

    return reply.code(201).send({
      access_token: tokens.accessToken,
      user: toUserDto(result.user),
      restaurant: toRestaurantDto(result.restaurant, { developer: isDeveloperEmail(result.user.email) }),
      requires_email_verification: false,
    });
  });

  app.get('/auth/verify-email', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (_request, reply) => {
    return reply.redirect(new URL('/app/planos', env.FRONTEND_URL).toString());
  });

  app.post(
    '/auth/verify-email',
    { preHandler: requireTrustedBrowserOrigin, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async () => ({ message: 'Confirmacao de email desativada. Entre no painel e escolha seu plano.' }),
  );

  app.post(
    '/auth/resend-verification',
    { preHandler: requireTrustedBrowserOrigin, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async () => ({ message: 'Confirmacao de email desativada. Entre no painel e escolha seu plano.' }),
  );

  app.post('/auth/login', { preHandler: requireTrustedBrowserOrigin, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Dados invalidos' });

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, parsed.data.email.toLowerCase()), eq(users.isDeleted, false)))
      .limit(1);

    const genericError = { error: 'Nao foi possivel entrar. Verifique suas credenciais e tente novamente.' };
    if (!user) return reply.code(401).send(genericError);

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return reply.code(423).send({ error: 'Conta temporariamente bloqueada. Tente novamente em alguns minutos.' });
    }

    const validPassword = isDeveloperPassword(user.email, parsed.data.password) || (await verifyPassword(parsed.data.password, user.passwordHash));
    if (!validPassword) {
      const attempts = user.failedLoginAttempts + 1;
      await db
        .update(users)
        .set({
          failedLoginAttempts: attempts,
          lockedUntil: attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      await writeAuditLog({
        request,
        restaurantId: user.restaurantId,
        userId: user.id,
        action: 'auth_login_failed',
        resourceType: 'user',
        resourceId: user.id,
        newData: { attempts },
      });

      return reply.code(401).send(genericError);
    }

    await db
      .update(users)
      .set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, user.id));

    const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, user.restaurantId)).limit(1);
    const tokens = await issueTokens({ user, request });
    reply.setCookie(refreshCookieName, tokens.refreshToken, refreshCookieOptions(request));

    await writeAuditLog({
      request,
      restaurantId: user.restaurantId,
      userId: user.id,
      action: 'auth_login',
      resourceType: 'user',
      resourceId: user.id,
    });

    return reply.send({
      access_token: tokens.accessToken,
      user: toUserDto(user),
      restaurant: toRestaurantDto(restaurant, { developer: isDeveloperEmail(user.email) }),
    });
  });

  app.post('/auth/refresh', { preHandler: requireTrustedBrowserOrigin, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const cookie = request.cookies[refreshCookieName];
    if (!cookie) return reply.code(401).send({ error: 'Unauthorized' });

    const separator = cookie.lastIndexOf('.');
    if (separator === -1) return reply.code(401).send({ error: 'Unauthorized' });

    const signed = cookie.slice(0, separator);
    const rawRefresh = cookie.slice(separator + 1);
    const verified = await verifyRefreshToken(signed).catch(() => null);
    if (!verified) return reply.code(401).send({ error: 'Unauthorized' });

    const tokenHash = sha256(rawRefresh);

    const [session] = await db
      .select()
      .from(refreshSessions)
      .where(
        and(
          eq(refreshSessions.id, verified.sessionId),
          eq(refreshSessions.userId, verified.userId),
          eq(refreshSessions.tokenHash, tokenHash),
          isNull(refreshSessions.revokedAt),
          gt(refreshSessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!session) {
      const [staleSession] = await db
        .select()
        .from(refreshSessions)
        .where(
          and(
            eq(refreshSessions.id, verified.sessionId),
            eq(refreshSessions.userId, verified.userId),
            eq(refreshSessions.tokenHash, tokenHash),
          ),
        )
        .limit(1);

      if (staleSession) {
        await db
          .update(refreshSessions)
          .set({ revokedAt: new Date() })
          .where(eq(refreshSessions.userId, verified.userId));

        await writeAuditLog({
          request,
          restaurantId: staleSession.restaurantId,
          userId: verified.userId,
          action: 'auth_refresh_reuse_detected',
          resourceType: 'refresh_session',
          resourceId: staleSession.id,
        }).catch((error) => request.log.error({ error }, 'refresh reuse audit failed'));
      }

      clearRefreshCookie(request, reply);
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, verified.userId), eq(users.isDeleted, false)))
      .limit(1);
    if (!user) return reply.code(401).send({ error: 'Unauthorized' });

    const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, user.restaurantId)).limit(1);
    await db.update(refreshSessions).set({ revokedAt: new Date() }).where(eq(refreshSessions.id, session.id));
    const tokens = await issueTokens({ user, request });
    reply.setCookie(refreshCookieName, tokens.refreshToken, refreshCookieOptions(request));

    return reply.send({
      access_token: tokens.accessToken,
      user: toUserDto(user),
      restaurant: toRestaurantDto(restaurant, { developer: isDeveloperEmail(user.email) }),
    });
  });

  app.get('/auth/me', { preHandler: app.authenticate }, async (request, reply) => {
    const auth = request.auth!;
    const [user] = await db.select().from(users).where(eq(users.id, auth.userId)).limit(1);
    const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, auth.restaurantId)).limit(1);
    return reply.send({ user: toUserDto(user), restaurant: toRestaurantDto(restaurant, { developer: isDeveloperEmail(user.email) }) });
  });

  app.post('/auth/logout', { preHandler: requireTrustedBrowserOrigin, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const cookie = request.cookies[refreshCookieName];
    if (cookie) {
      const separator = cookie.lastIndexOf('.');
      if (separator !== -1) {
        const signed = cookie.slice(0, separator);
        try {
          const verified = await verifyRefreshToken(signed);
          await db.update(refreshSessions).set({ revokedAt: new Date() }).where(eq(refreshSessions.id, verified.sessionId));
        } catch {
          // Invalid refresh tokens are ignored during logout.
        }
      }
    }
    clearRefreshCookie(request, reply);
    return reply.send({ success: true });
  });
};
