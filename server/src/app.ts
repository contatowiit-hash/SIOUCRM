import fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { env } from './env.js';
import { authPlugin } from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';
import { aiSettingsRoutes } from './routes/ai-settings.js';
import { automationRoutes } from './routes/automations.js';
import { billingRoutes } from './routes/billing.js';
import { campaignRoutes } from './routes/campaigns.js';
import { customerRoutes } from './routes/customers.js';
import { orderRoutes } from './routes/orders.js';
import { planRoutes } from './routes/plan.js';
import { reservationRoutes } from './routes/reservations.js';
import { usageRoutes } from './routes/usage.js';
import { whatsappRoutes } from './routes/whatsapp.js';
import { integrationRoutes } from './routes/integrations.js';
import { integrationWebhookRoutes } from './routes/webhooks/integrations.js';
import { stripeWebhookRoute } from './routes/webhooks/stripe.js';
import { whatsappGatewayWebhookRoutes } from './routes/webhooks/whatsapp.js';
import { secureLoggerOptions } from './utils/logger.js';

const permissionsPolicy =
  'accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), usb=(), xr-spatial-tracking=()';

const productionOrigins = ['https://www.sioucrm.com', 'https://sioucrm.com'];

export const buildApp = async () => {
  const app = fastify({
    logger: secureLoggerOptions,
    bodyLimit: 1_000_000,
  });

  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    try {
      const rawBody = typeof body === 'string' ? body : body.toString();
      (request as typeof request & { rawBody?: string }).rawBody = rawBody;
      const parsed = rawBody ? JSON.parse(rawBody) : {};
      done(null, parsed);
    } catch (error) {
      done(error as Error);
    }
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'", env.APP_URL, ...productionOrigins],
        frameAncestors: ["'none'"],
        formAction: ["'self'", 'https://checkout.stripe.com'],
        imgSrc: ["'self'", 'data:', 'https://*.whatsapp.net', 'https://*.fbcdn.net'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
      },
    },
    frameguard: { action: 'deny' },
    hsts: env.NODE_ENV === 'production' ? { maxAge: 63_072_000, includeSubDomains: true, preload: true } : false,
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      const allowed = new Set([env.APP_URL, env.FRONTEND_URL, ...productionOrigins]);
      if (env.NODE_ENV !== 'production') {
        allowed.add('http://127.0.0.1:5174');
        allowed.add('http://localhost:5174');
      }

      if (!origin || allowed.has(origin)) {
        callback(null, true);
        return;
      }

      const error = new Error('Origin not allowed') as Error & { statusCode: number };
      error.statusCode = 403;
      callback(error, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'authorization',
      'content-type',
      'x-webhook-signature',
      'x-hub-signature-256',
      'x-timestamp',
      'x-signature',
      'x-request-id',
      'x-integration-token',
      'x-provider-token',
      'x-app-id',
      'x-app-merchantid',
      'x-app-signature',
    ],
    maxAge: 600,
    strictPreflight: true,
  });

  await app.register(cookie);

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('Permissions-Policy', permissionsPolicy);

    if (request.url.startsWith('/api/') || request.url.startsWith('/webhooks/')) {
      reply.header('Cache-Control', 'no-store, max-age=0');
      reply.header('Pragma', 'no-cache');
      reply.header('Expires', '0');
    }

    return payload;
  });

  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.auth?.restaurantId ?? request.ip,
  });

  await authPlugin(app);

  app.get('/health', async () => ({ ok: true, service: 'syntra-food-api' }));
  app.get('/api/health', async () => ({ ok: true, service: 'syntra-food-api' }));
  app.register(authRoutes, { prefix: '/api' });
  app.register(aiSettingsRoutes, { prefix: '/api' });
  app.register(billingRoutes, { prefix: '/api' });
  app.register(automationRoutes, { prefix: '/api' });
  app.register(customerRoutes, { prefix: '/api' });
  app.register(reservationRoutes, { prefix: '/api' });
  app.register(orderRoutes, { prefix: '/api' });
  app.register(planRoutes, { prefix: '/api' });
  app.register(usageRoutes, { prefix: '/api' });
  app.register(campaignRoutes, { prefix: '/api' });
  app.register(whatsappRoutes, { prefix: '/api' });
  app.register(integrationRoutes, { prefix: '/api' });
  app.register(stripeWebhookRoute);
  app.register(whatsappGatewayWebhookRoutes);
  app.register(integrationWebhookRoutes);

  app.setErrorHandler((error, request, reply) => {
    const errorRecord =
      error && typeof error === 'object' ? (error as { code?: unknown; statusCode?: unknown }) : {};
    const candidateStatus = Number(errorRecord.statusCode);
    const statusCode = candidateStatus >= 400 && candidateStatus < 500 ? candidateStatus : 500;

    if (statusCode >= 500) {
      request.log.error({ err: error }, 'request failed');
    } else {
      request.log.warn({ code: errorRecord.code, statusCode }, 'request rejected');
    }

    const messages: Record<number, string> = {
      400: 'Requisicao invalida.',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Nao encontrado.',
      409: 'Conflito ao processar a requisicao.',
      413: 'Requisicao muito grande.',
      429: 'Muitas tentativas. Aguarde e tente novamente.',
    };

    return reply.code(statusCode).send({ error: messages[statusCode] ?? 'Erro interno. Tente novamente.' });
  });

  return app;
};
