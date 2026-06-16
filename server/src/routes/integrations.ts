import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { paymentConnections, pdvConnections } from '../db/schema.js';
import { env } from '../env.js';
import { pdvProviders } from '../integrations/pdv/index.js';
import { requireRoles } from '../plugins/auth.js';
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
  verifyIntegrationState,
} from '../utils/integrationCrypto.js';
import { exchangeMercadoPagoCode } from '../integrations/payments/mercado_pago/client.js';
import { exchangePagBankCode } from '../integrations/payments/pagbank/client.js';
import {
  createGoomerCredentials,
  parseGoomerCredentials,
  serializeGoomerCredentials,
  validateGoomerCredentials,
} from '../integrations/pdv/goomer/client.js';
import { writeAuditLog } from '../utils/audit.js';
import { getRemainingProviderConfig, remainingPaymentProviders, type RemainingPaymentProvider } from '../integrations/payments/index.js';
import {
  testOwnPaymentCredentials,
  type OwnCredentialProvider,
  type OwnPaymentCredentials,
} from '../integrations/payments/credential-test.js';
import { runPaymentReceiptTest } from '../services/paymentReceiptTest.js';

const paymentProviders = ['mercado_pago', ...remainingPaymentProviders] as const;
const paymentProviderSchema = z.enum(paymentProviders);
const pdvProviderSchema = z.enum(pdvProviders);
const pdvConnectSchema = z.object({ token: z.string().trim().min(8).max(1000) });
const goomerConnectSchema = z
  .object({
    client_id: z.string().trim().min(2).max(1000),
    client_secret: z.string().trim().min(8).max(4000),
  })
  .strict();
const infinitePayConnectSchema = z.object({ handle: z.string().trim().min(2).max(120).regex(/^[a-zA-Z0-9._-]+$/) });
const callbackSchema = z.object({ code: z.string().min(4).max(2000), state: z.string().min(10).max(4000) });
const ownCredentialProviders = ['mercado_pago', 'pagbank', 'cielo', 'getnet'] as const;
const ownCredentialSchema = z
  .object({
    access_token: z.string().trim().min(12).max(4000).optional(),
    webhook_secret: z.string().trim().min(8).max(4000).optional(),
    merchant_id: z.string().trim().min(4).max(300).optional(),
    merchant_key: z.string().trim().min(8).max(4000).optional(),
    seller_id: z.string().trim().min(2).max(300).optional(),
    client_id: z.string().trim().min(4).max(1000).optional(),
    client_secret: z.string().trim().min(8).max(4000).optional(),
  })
  .strict();

const paymentNames: Record<(typeof paymentProviders)[number], string> = {
  mercado_pago: 'Mercado Pago',
  stone: 'Stone',
  pagbank: 'PagBank',
  cielo: 'Cielo',
  getnet: 'Getnet',
  rede: 'Rede',
  ton: 'Ton',
  safrapay: 'SafraPay',
  infinitepay: 'InfinitePay',
};

const pdvNames: Record<(typeof pdvProviders)[number], string> = {
  saipos: 'Saipos',
  goomer: 'Goomer',
  anotaai: 'Anota AI',
  sischef: 'Sischef',
  consumer: 'Consumer',
};

const ensureRemainingPaymentConnections = async (restaurantId: string) => {
  await db
    .insert(paymentConnections)
    .values(
      remainingPaymentProviders.map((provider) => ({
        restaurantId,
        provider,
        status: 'not_configured',
      })),
    )
    .onConflictDoNothing();
};

const isPaymentProviderAvailable = (provider: (typeof paymentProviders)[number]) => {
  if (ownCredentialProviders.includes(provider as OwnCredentialProvider)) return Boolean(env.INTEGRATION_ENCRYPTION_KEY);
  if (provider === 'infinitepay') return true;
  return getRemainingProviderConfig(provider as RemainingPaymentProvider).configured;
};

const paymentWebhookUrl = (request: { protocol: string; headers: { host?: string } }, provider: string, connectionId: string) =>
  `${request.protocol}://${request.headers.host}/webhooks/payments/${provider}?connection_id=${connectionId}`;

const parseOwnCredentials = (provider: OwnCredentialProvider, body: unknown) => {
  const parsed = ownCredentialSchema.safeParse(body);
  if (!parsed.success) return null;
  const value = parsed.data;
  if (provider === 'mercado_pago' && (!value.access_token || !value.webhook_secret)) return null;
  if (provider === 'pagbank' && !value.access_token) return null;
  if (provider === 'cielo' && (!value.merchant_id || !value.merchant_key)) return null;
  if (provider === 'getnet' && (!value.seller_id || !value.client_id || !value.client_secret)) return null;
  return value;
};

const storedCredentials = (
  provider: OwnCredentialProvider,
  connection: { accessToken: string | null; refreshToken: string | null; externalAccountId: string | null },
): OwnPaymentCredentials => {
  if (provider === 'mercado_pago' || provider === 'pagbank') {
    return { accessToken: connection.accessToken ? decryptIntegrationSecret(connection.accessToken) : undefined };
  }
  if (provider === 'cielo') {
    return {
      merchantId: connection.externalAccountId ?? undefined,
      merchantKey: connection.accessToken ? decryptIntegrationSecret(connection.accessToken) : undefined,
    };
  }
  return {
    sellerId: connection.externalAccountId ?? undefined,
    clientId: connection.accessToken ? decryptIntegrationSecret(connection.accessToken) : undefined,
    clientSecret: connection.refreshToken ? decryptIntegrationSecret(connection.refreshToken) : undefined,
  };
};

export const integrationRoutes = async (app: FastifyInstance) => {
  app.get('/integrations/payments', { preHandler: [app.authenticate, requireRoles('owner', 'admin', 'manager', 'agent')] }, async (request) => {
    await ensureRemainingPaymentConnections(request.auth!.restaurantId);
    const rows = await db
      .select({ provider: paymentConnections.provider, status: paymentConnections.status, lastError: paymentConnections.lastError, id: paymentConnections.id })
      .from(paymentConnections)
      .where(eq(paymentConnections.restaurantId, request.auth!.restaurantId));
    return {
      data: paymentProviders.map((provider) => {
        const row = rows.find((item) => item.provider === provider);
        const providerConfigured = isPaymentProviderAvailable(provider);
        const status =
          providerConfigured && row?.status === 'not_configured'
            ? 'disconnected'
            : row?.status ?? (providerConfigured ? 'disconnected' : 'not_configured');
        return {
          provider,
          name: paymentNames[provider],
          status,
          available: providerConfigured,
          credential_mode: ownCredentialProviders.includes(provider as OwnCredentialProvider) ? 'restaurant' : 'platform',
          webhook_url: row?.id && row.status === 'connected' ? paymentWebhookUrl(request, provider, row.id) : null,
          message:
            row?.status === 'error'
              ? 'Verifique sua credencial.'
              : ownCredentialProviders.includes(provider as OwnCredentialProvider) && !providerConfigured
                ? 'O armazenamento seguro de credenciais ainda nao foi configurado.'
                  : !providerConfigured
                    ? 'Esta adquirente exige liberacao da conta de parceiro antes da conexao.'
                    : null,
        };
      }),
    };
  });

  app.get('/integrations/pdv', { preHandler: [app.authenticate, requireRoles('owner', 'admin', 'manager', 'agent')] }, async (request) => {
    const rows = await db
      .select({ provider: pdvConnections.provider, status: pdvConnections.status, webhookUrl: pdvConnections.webhookUrl })
      .from(pdvConnections)
      .where(eq(pdvConnections.restaurantId, request.auth!.restaurantId));
    return {
      data: pdvProviders.map((provider) => {
        const row = rows.find((item) => item.provider === provider);
        return { provider, name: pdvNames[provider], status: row?.status ?? 'disconnected', webhook_url: row?.webhookUrl ?? null };
      }),
    };
  });

  app.post('/integrations/payments/:provider/connect', { preHandler: [app.authenticate, requireRoles('owner')] }, async (request, reply) => {
    const parsed = paymentProviderSchema.safeParse((request.params as { provider?: string }).provider);
    if (!parsed.success) return reply.code(404).send({ error: 'Integracao nao encontrada.' });
    if (ownCredentialProviders.includes(parsed.data as OwnCredentialProvider)) {
      if (!env.INTEGRATION_ENCRYPTION_KEY) {
        return reply.code(503).send({ error: 'O armazenamento seguro de credenciais ainda nao foi configurado.' });
      }
      const provider = parsed.data as OwnCredentialProvider;
      const credentials = parseOwnCredentials(provider, request.body);
      if (!credentials) return reply.code(400).send({ error: 'Confira os codigos informados.' });
      const [existing] = await db
        .select({ id: paymentConnections.id })
        .from(paymentConnections)
        .where(and(eq(paymentConnections.restaurantId, request.auth!.restaurantId), eq(paymentConnections.provider, provider)))
        .limit(1);
      const connectionId = existing?.id ?? crypto.randomUUID();
      const accessSecret =
        provider === 'cielo'
          ? credentials.merchant_key!
          : provider === 'getnet'
            ? credentials.client_id!
            : credentials.access_token!;
      const refreshSecret =
        provider === 'getnet' ? credentials.client_secret! : provider === 'mercado_pago' ? credentials.webhook_secret : undefined;
      const externalAccountId =
        provider === 'cielo' ? credentials.merchant_id! : provider === 'getnet' ? credentials.seller_id! : null;
      await db
        .insert(paymentConnections)
        .values({
          id: connectionId,
          restaurantId: request.auth!.restaurantId,
          provider,
          status: 'connected',
          accessToken: encryptIntegrationSecret(accessSecret),
          refreshToken: refreshSecret ? encryptIntegrationSecret(refreshSecret) : null,
          externalAccountId,
          connectedAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [paymentConnections.restaurantId, paymentConnections.provider],
          set: {
            status: 'connected',
            accessToken: encryptIntegrationSecret(accessSecret),
            refreshToken: refreshSecret ? encryptIntegrationSecret(refreshSecret) : null,
            externalAccountId,
            connectedAt: new Date(),
            lastError: null,
            updatedAt: new Date(),
          },
        });
      await writeAuditLog({
        request,
        restaurantId: request.auth!.restaurantId,
        userId: request.auth!.userId,
        action: 'payment_credentials_saved',
        resourceType: 'integration',
        resourceId: connectionId,
        newData: { provider },
      });
      return {
        data: {
          provider,
          status: 'connected',
          webhook_url: paymentWebhookUrl(request, provider, connectionId),
        },
      };
    }
    if (parsed.data === 'infinitepay') {
      const body = infinitePayConnectSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Informe o identificador da sua conta InfinitePay.' });
      await db
        .insert(paymentConnections)
        .values({
          restaurantId: request.auth!.restaurantId,
          provider: parsed.data,
          status: 'connected',
          externalAccountId: body.data.handle,
          connectedAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [paymentConnections.restaurantId, paymentConnections.provider],
          set: {
            status: 'connected',
            externalAccountId: body.data.handle,
            connectedAt: new Date(),
            lastError: null,
            updatedAt: new Date(),
          },
        });
      await writeAuditLog({
        request,
        restaurantId: request.auth!.restaurantId,
        userId: request.auth!.userId,
        action: 'payment_connected',
        resourceType: 'integration',
      });
      return { data: { provider: parsed.data, status: 'connected' } };
    }
    if (parsed.data !== 'mercado_pago') {
      const config = getRemainingProviderConfig(parsed.data);
      if (!config.configured) return reply.code(409).send({ error: 'A adquirente ainda nao liberou as credenciais de parceiro.' });
      return {
        action: 'contact_support',
        message: `${config.name} exige a conclusao do cadastro de parceiro antes de conectar a conta.`,
      };
    }
    return reply.code(400).send({ error: 'Confira os codigos informados.' });
  });

  app.post('/integrations/payments/:provider/test', { preHandler: [app.authenticate, requireRoles('owner')] }, async (request, reply) => {
    const parsed = paymentProviderSchema.safeParse((request.params as { provider?: string }).provider);
    if (!parsed.success || !ownCredentialProviders.includes(parsed.data as OwnCredentialProvider)) {
      return reply.code(404).send({ error: 'Integracao nao encontrada.' });
    }
    const provider = parsed.data as OwnCredentialProvider;
    const [connection] = await db
      .select()
      .from(paymentConnections)
      .where(and(eq(paymentConnections.restaurantId, request.auth!.restaurantId), eq(paymentConnections.provider, provider)))
      .limit(1);
    if (!connection?.accessToken) return reply.code(409).send({ error: 'Salve sua credencial antes de testar.' });
    try {
      const result = await testOwnPaymentCredentials(provider, storedCredentials(provider, connection));
      await db
        .update(paymentConnections)
        .set({
          status: 'connected',
          externalAccountId: result.externalAccountId ?? connection.externalAccountId,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(paymentConnections.id, connection.id));
      return { data: { provider, status: 'connected' } };
    } catch (error) {
      await db
        .update(paymentConnections)
        .set({ status: 'error', lastError: 'Verifique sua credencial.', updatedAt: new Date() })
        .where(eq(paymentConnections.id, connection.id));
      request.log.warn({ err: error, provider, restaurantId: request.auth!.restaurantId }, 'payment credential test failed');
      return reply.code(422).send({ error: 'Nao foi possivel confirmar os codigos. Revise os dados e tente novamente.' });
    }
  });

  app.post('/integrations/payments/:provider/test-receipt', { preHandler: [app.authenticate, requireRoles('owner')] }, async (request, reply) => {
    const parsed = paymentProviderSchema.safeParse((request.params as { provider?: string }).provider);
    if (!parsed.success || !ownCredentialProviders.includes(parsed.data as OwnCredentialProvider)) {
      return reply.code(404).send({ error: 'Integracao nao encontrada.' });
    }
    const provider = parsed.data as OwnCredentialProvider;
    const [connection] = await db
      .select()
      .from(paymentConnections)
      .where(
        and(
          eq(paymentConnections.restaurantId, request.auth!.restaurantId),
          eq(paymentConnections.provider, provider),
          eq(paymentConnections.status, 'connected'),
        ),
      )
      .limit(1);
    if (!connection?.accessToken) return reply.code(409).send({ error: 'Conecte esta conta antes de testar o recebimento.' });
    try {
      return { data: await runPaymentReceiptTest(provider, connection) };
    } catch (error) {
      request.log.warn({ err: error, provider, restaurantId: request.auth!.restaurantId }, 'payment receipt test failed');
      return reply.code(422).send({ error: 'O teste de recebimento falhou. Revise os codigos da conexao.' });
    }
  });

  app.get('/integrations/payments/:provider/callback', async (request, reply) => {
    const provider = paymentProviderSchema.safeParse((request.params as { provider?: string }).provider);
    const query = callbackSchema.safeParse(request.query);
    if (!provider.success || !['mercado_pago', 'pagbank'].includes(provider.data) || !query.success) {
      return reply.code(400).send({ error: 'Nao foi possivel concluir a conexao.' });
    }
    const state = verifyIntegrationState(query.data.state);
    if (!state || state.provider !== provider.data) return reply.code(403).send({ error: 'Conexao invalida ou expirada.' });
    try {
      const tokens =
        provider.data === 'mercado_pago' ? await exchangeMercadoPagoCode(query.data.code) : await exchangePagBankCode(query.data.code);
      await db
        .insert(paymentConnections)
        .values({
          restaurantId: state.restaurantId,
          provider: provider.data,
          status: 'connected',
          accessToken: encryptIntegrationSecret(tokens.accessToken),
          refreshToken: tokens.refreshToken ? encryptIntegrationSecret(tokens.refreshToken) : null,
          externalAccountId: tokens.externalAccountId,
          connectedAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [paymentConnections.restaurantId, paymentConnections.provider],
          set: {
            status: 'connected',
            accessToken: encryptIntegrationSecret(tokens.accessToken),
            refreshToken: tokens.refreshToken ? encryptIntegrationSecret(tokens.refreshToken) : null,
            externalAccountId: tokens.externalAccountId,
            connectedAt: new Date(),
            lastError: null,
            updatedAt: new Date(),
          },
        });
      return reply.redirect(`${env.APP_URL}/app/configuracoes?pagamento=conectado`);
    } catch (error) {
      request.log.error({ err: error, provider: provider.data }, 'payment connection callback failed');
      return reply.redirect(`${env.APP_URL}/app/configuracoes?pagamento=erro`);
    }
  });

  app.post('/integrations/payments/:provider/disconnect', { preHandler: [app.authenticate, requireRoles('owner')] }, async (request, reply) => {
    const provider = paymentProviderSchema.safeParse((request.params as { provider?: string }).provider);
    if (!provider.success) return reply.code(404).send({ error: 'Integracao nao encontrada.' });
    await db
      .update(paymentConnections)
      .set({ status: 'disconnected', accessToken: null, refreshToken: null, externalAccountId: null, updatedAt: new Date() })
      .where(and(eq(paymentConnections.restaurantId, request.auth!.restaurantId), eq(paymentConnections.provider, provider.data)));
    await writeAuditLog({ request, restaurantId: request.auth!.restaurantId, userId: request.auth!.userId, action: 'payment_disconnected', resourceType: 'integration' });
    return { success: true };
  });

  app.post('/integrations/pdv/:provider/connect', { preHandler: [app.authenticate, requireRoles('owner')] }, async (request, reply) => {
    const provider = pdvProviderSchema.safeParse((request.params as { provider?: string }).provider);
    if (!provider.success) return reply.code(400).send({ error: 'Revise os dados da integracao.' });
    if (!env.INTEGRATION_ENCRYPTION_KEY) return reply.code(503).send({ error: 'Integracoes ainda nao foram configuradas.' });
    const existing = await db
      .select({ id: pdvConnections.id })
      .from(pdvConnections)
      .where(and(eq(pdvConnections.restaurantId, request.auth!.restaurantId), eq(pdvConnections.provider, provider.data)))
      .limit(1);
    const connectionId = existing[0]?.id ?? crypto.randomUUID();
    const origin = `${request.protocol}://${request.headers.host}`;
    const webhookUrl = `${origin}/webhooks/pdv/${provider.data}/${connectionId}`;

    if (provider.data === 'goomer') {
      const body = goomerConnectSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Informe a identificacao e o codigo secreto da Goomer.' });
      let encryptedCredentials: string;
      try {
        const credentials = await createGoomerCredentials(body.data.client_id, body.data.client_secret);
        encryptedCredentials = encryptIntegrationSecret(serializeGoomerCredentials(credentials));
      } catch {
        request.log.warn({ provider: 'goomer', restaurantId: request.auth!.restaurantId }, 'goomer credential validation failed');
        return reply.code(422).send({ error: 'Nao foi possivel confirmar os dados da Goomer. Revise os codigos e tente novamente.' });
      }
      await db
        .insert(pdvConnections)
        .values({
          id: connectionId,
          restaurantId: request.auth!.restaurantId,
          provider: provider.data,
          status: 'connected',
          integrationToken: encryptedCredentials,
          webhookUrl,
          connectedAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [pdvConnections.restaurantId, pdvConnections.provider],
          set: {
            status: 'connected',
            integrationToken: encryptedCredentials,
            webhookUrl,
            connectedAt: new Date(),
            lastError: null,
            updatedAt: new Date(),
          },
        });
      await writeAuditLog({
        request,
        restaurantId: request.auth!.restaurantId,
        userId: request.auth!.userId,
        action: 'pdv_connected',
        resourceType: 'integration',
        resourceId: connectionId,
        newData: { provider: provider.data },
      });
      return { data: { provider: provider.data, status: 'connected', webhook_url: webhookUrl } };
    }

    const body = pdvConnectSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Revise os dados da integracao.' });
    await db
      .insert(pdvConnections)
      .values({
        id: connectionId,
        restaurantId: request.auth!.restaurantId,
        provider: provider.data,
        status: 'connected',
        integrationToken: encryptIntegrationSecret(body.data.token),
        webhookUrl,
        connectedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [pdvConnections.restaurantId, pdvConnections.provider],
        set: { status: 'connected', integrationToken: encryptIntegrationSecret(body.data.token), webhookUrl, connectedAt: new Date(), lastError: null, updatedAt: new Date() },
      });
    await writeAuditLog({ request, restaurantId: request.auth!.restaurantId, userId: request.auth!.userId, action: 'pdv_connected', resourceType: 'integration', resourceId: connectionId });
    return { data: { provider: provider.data, status: 'connected', webhook_url: webhookUrl } };
  });

  app.post('/integrations/pdv/:provider/test', { preHandler: [app.authenticate, requireRoles('owner')] }, async (request, reply) => {
    const provider = pdvProviderSchema.safeParse((request.params as { provider?: string }).provider);
    if (!provider.success || provider.data !== 'goomer') return reply.code(404).send({ error: 'Integracao nao encontrada.' });
    if (!env.INTEGRATION_ENCRYPTION_KEY) return reply.code(503).send({ error: 'Integracoes ainda nao foram configuradas.' });

    const [connection] = await db
      .select()
      .from(pdvConnections)
      .where(and(eq(pdvConnections.restaurantId, request.auth!.restaurantId), eq(pdvConnections.provider, provider.data)))
      .limit(1);

    if (!connection?.integrationToken) return reply.code(409).send({ error: 'Conecte a Goomer antes de testar.' });

    try {
      const credentials = parseGoomerCredentials(decryptIntegrationSecret(connection.integrationToken));
      const validatedCredentials = await validateGoomerCredentials(credentials);
      await db
        .update(pdvConnections)
        .set({
          status: 'connected',
          integrationToken: encryptIntegrationSecret(serializeGoomerCredentials(validatedCredentials)),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(pdvConnections.id, connection.id));
      await writeAuditLog({
        request,
        restaurantId: request.auth!.restaurantId,
        userId: request.auth!.userId,
        action: 'pdv_connection_tested',
        resourceType: 'integration',
        resourceId: connection.id,
        newData: { provider: provider.data },
      });
      return { data: { provider: provider.data, status: 'connected' } };
    } catch {
      await db
        .update(pdvConnections)
        .set({ status: 'error', lastError: 'Verifique os codigos da Goomer.', updatedAt: new Date() })
        .where(eq(pdvConnections.id, connection.id));
      request.log.warn({ provider: provider.data, restaurantId: request.auth!.restaurantId }, 'goomer connection test failed');
      return reply.code(422).send({ error: 'Nao foi possivel confirmar a Goomer. Revise os codigos e tente novamente.' });
    }
  });

  app.post('/integrations/pdv/:provider/disconnect', { preHandler: [app.authenticate, requireRoles('owner')] }, async (request, reply) => {
    const provider = pdvProviderSchema.safeParse((request.params as { provider?: string }).provider);
    if (!provider.success) return reply.code(404).send({ error: 'Integracao nao encontrada.' });
    await db
      .update(pdvConnections)
      .set({ status: 'disconnected', integrationToken: null, lastError: null, updatedAt: new Date() })
      .where(and(eq(pdvConnections.restaurantId, request.auth!.restaurantId), eq(pdvConnections.provider, provider.data)));
    return { success: true };
  });
};
