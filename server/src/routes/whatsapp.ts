import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, desc, eq, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { customers, restaurants, whatsappConversations, whatsappMessages } from '../db/schema.js';
import { env } from '../env.js';
import { createWebhookHmacMiddleware } from '../middleware/verifyWebhookHmac.js';
import { requirePlan } from '../middleware/requirePlan.js';
import { requireRoles } from '../plugins/auth.js';
import { WhatsAppSendSchema } from '../schemas.js';
import { recordUsage } from '../services/usage.js';
import { checkWhatsAppSendAllowed } from '../services/whatsappSafety.js';
import { writeAuditLog } from '../utils/audit.js';
import { paginationMeta, parsePagination, type PaginationQuery } from '../utils/pagination.js';
import { sanitizePhone, sanitizeText } from '../utils/security.js';

const GatewayTextSchema = z.object({
  to: z.string().min(8).max(30),
  message: z.string().min(1).max(4096),
});

const gatewayUnavailableMessage =
  'WhatsApp Gateway desligado. Abra o arquivo abrir-whatsapp-gateway.cmd e deixe a janela aberta.';

const toIsoString = (value: Date | string | null | undefined) => {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

const whatsappPhone = (value: string) => sanitizePhone(value).replace(/\D/g, '');

const hasGroupJid = (value: unknown) => typeof value === 'string' && value.includes('@g.us');

const asRecord = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const isGroupWebhookPayload = (payload: Record<string, unknown>) => {
  const data = asRecord(payload.data);
  const key = asRecord(data.key ?? payload.key);

  return (
    payload.isGroup === true ||
    data.isGroup === true ||
    typeof payload.groupId === 'string' ||
    typeof payload.group_id === 'string' ||
    typeof data.groupId === 'string' ||
    typeof data.group_id === 'string' ||
    hasGroupJid(payload.remoteJid) ||
    hasGroupJid(payload.chatId) ||
    hasGroupJid(payload.from) ||
    hasGroupJid(payload.phone) ||
    hasGroupJid(data.remoteJid) ||
    hasGroupJid(data.chatId) ||
    hasGroupJid(key.remoteJid) ||
    hasGroupJid(key.participant)
  );
};

const createGatewaySignature = (timestamp: string, method: string, path: string, secret: string) =>
  `sha256=${createHmac('sha256', secret).update(`${timestamp}.${method.toUpperCase()}.${path}`).digest('hex')}`;

const getGatewayHeaders = (method: string, path: string) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const secret = env.GATEWAY_SECRET;
  if (secret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    headers['X-Timestamp'] = timestamp;
    headers['X-Gateway-Signature'] = createGatewaySignature(timestamp, method, path, secret);
  }

  return headers;
};

const gatewayFetch = async (path: string, init: RequestInit = {}) => {
  if (!env.GATEWAY_URL) {
    throw new Error('GATEWAY_URL_NOT_CONFIGURED');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  const method = init.method ?? 'GET';

  try {
    return await fetch(`${env.GATEWAY_URL}${path}`, {
      ...init,
      headers: {
        ...getGatewayHeaders(method, path),
        ...(init.headers as Record<string, string> | undefined),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

export const whatsappRoutes = async (app: FastifyInstance) => {
  app.get('/whatsapp/conversations', { preHandler: [app.authenticate, requireRoles('owner', 'admin', 'agent')] }, async (request) => {
    const auth = request.auth!;
    const query = request.query as PaginationQuery & { messages_limit?: string | number };
    const { page, pageSize, offset } = parsePagination(query, 25, 50);
    const requestedMessageLimit = Number(query.messages_limit);
    const messagesLimit =
      Number.isInteger(requestedMessageLimit) && requestedMessageLimit > 0 ? Math.min(requestedMessageLimit, 100) : 50;
    const rows = await db
      .select({
        conversation: whatsappConversations,
        customer: customers,
      })
      .from(whatsappConversations)
      .leftJoin(
        customers,
        and(eq(whatsappConversations.customerId, customers.id), eq(customers.restaurantId, auth.restaurantId)),
      )
      .where(and(eq(whatsappConversations.restaurantId, auth.restaurantId), eq(whatsappConversations.isDeleted, false)))
      .orderBy(desc(whatsappConversations.lastMessageAt))
      .limit(pageSize)
      .offset(offset);

    const groupedRows = new Map<
      string,
      {
        conversations: Array<typeof whatsappConversations.$inferSelect>;
        customer: typeof customers.$inferSelect | null;
      }
    >();

    for (const { conversation, customer } of rows) {
      const key = whatsappPhone(conversation.phone);
      const current = groupedRows.get(key) ?? { conversations: [], customer: null };
      current.conversations.push(conversation);
      if (customer && !current.customer) current.customer = customer;
      groupedRows.set(key, current);
    }

    const data = await Promise.all(
      Array.from(groupedRows.entries()).map(async ([phone, group]) => {
        const conversation = group.conversations[0];
        const customer = group.customer;
        const messages = await db
          .select()
          .from(whatsappMessages)
          .where(
            and(
              eq(whatsappMessages.restaurantId, auth.restaurantId),
              or(eq(whatsappMessages.phone, phone), eq(whatsappMessages.phone, `+${phone}`)),
            ),
          )
          .orderBy(desc(whatsappMessages.createdAt))
          .limit(messagesLimit);
        const lastMessageAt = group.conversations
          .map((item) => item.lastMessageAt)
          .sort((left, right) => right.getTime() - left.getTime())[0];

        return {
          id: conversation.id,
          customer_id: customer?.id ?? conversation.customerId,
          customer_name: customer?.name ?? `Cliente ${conversation.phone.slice(-4)}`,
          phone: customer?.phone ?? phone,
          avatar_url: customer?.avatarUrl ?? null,
          last_message_at: toIsoString(lastMessageAt) ?? new Date().toISOString(),
          tags: customer?.tags ?? ['WhatsApp'],
          last_visit: customer?.lastVisit ?? null,
          orders_count: customer?.ordersCount ?? 0,
          messages: messages.reverse().map((message) => ({
            id: message.id,
            customer_id: message.customerId,
            phone: message.phone,
            body: message.body,
            direction: message.direction,
            provider: message.provider,
            created_at: toIsoString(message.createdAt) ?? new Date().toISOString(),
          })),
        };
      }),
    );

    return {
      data: data.sort((left, right) => new Date(right.last_message_at).getTime() - new Date(left.last_message_at).getTime()),
      pagination: paginationMeta(page, pageSize, rows.length),
    };
  });

  app.delete('/whatsapp/messages/:messageId', { preHandler: [app.authenticate, requireRoles('owner', 'admin')] }, async (request, reply) => {
    const params = z.object({ messageId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Mensagem invalida.' });

    const auth = request.auth!;
    const [message] = await db
      .select()
      .from(whatsappMessages)
      .where(and(eq(whatsappMessages.id, params.data.messageId), eq(whatsappMessages.restaurantId, auth.restaurantId)))
      .limit(1);

    if (!message) return reply.code(404).send({ error: 'Mensagem nao encontrada.' });

    await db
      .delete(whatsappMessages)
      .where(and(eq(whatsappMessages.id, params.data.messageId), eq(whatsappMessages.restaurantId, auth.restaurantId)));

    writeAuditLog({
      request,
      restaurantId: auth.restaurantId,
      userId: auth.userId,
      action: 'whatsapp_message_deleted',
      resourceType: 'whatsapp_message',
      resourceId: message.id,
      oldData: { phone: message.phone, direction: message.direction, provider: message.provider },
    }).catch((error) => request.log.error({ error }, 'whatsapp delete audit log failed'));

    return { success: true };
  });

  app.get('/whatsapp/gateway/session', { preHandler: [app.authenticate, requireRoles('owner', 'admin')] }, async (request, reply) => {
    const auth = request.auth!;

    try {
      const response = await gatewayFetch(`/sessions/${auth.restaurantId}`);

      if (response.status === 404) {
        return {
          status: 'idle',
          qrCode: null,
          phoneNumber: null,
          connectedAt: null,
          error: null,
        };
      }

      if (!response.ok) {
        return reply.code(502).send({ error: gatewayUnavailableMessage });
      }

      return response.json();
    } catch {
      return reply.code(503).send({ error: gatewayUnavailableMessage });
    }
  });

  app.post(
    '/whatsapp/gateway/session',
    { preHandler: [app.authenticate, requireRoles('owner', 'admin')], config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
    const auth = request.auth!;

    try {
      const response = await gatewayFetch(`/sessions/${auth.restaurantId}`, { method: 'POST', body: '{}' });

      if (!response.ok) {
        return reply.code(502).send({ error: gatewayUnavailableMessage });
      }

      writeAuditLog({
        request,
        restaurantId: auth.restaurantId,
        userId: auth.userId,
        action: 'whatsapp_gateway_session_started',
        resourceType: 'whatsapp_gateway',
        resourceId: null,
        newData: { provider: 'baileys_gateway' },
      }).catch((error) => request.log.error({ error }, 'gateway session audit log failed'));

      return reply.code(202).send({ success: true });
    } catch {
      return reply.code(503).send({ error: gatewayUnavailableMessage });
    }
    },
  );

  app.delete('/whatsapp/gateway/session', { preHandler: [app.authenticate, requireRoles('owner', 'admin')] }, async (request, reply) => {
    const auth = request.auth!;

    try {
      const response = await gatewayFetch(`/sessions/${auth.restaurantId}`, { method: 'DELETE' });

      if (response.status !== 404 && !response.ok) {
        return reply.code(502).send({ error: gatewayUnavailableMessage });
      }

      writeAuditLog({
        request,
        restaurantId: auth.restaurantId,
        userId: auth.userId,
        action: 'whatsapp_gateway_session_stopped',
        resourceType: 'whatsapp_gateway',
        resourceId: null,
        newData: { provider: 'baileys_gateway' },
      }).catch((error) => request.log.error({ error }, 'gateway disconnect audit log failed'));

      return { success: true };
    } catch {
      return reply.code(503).send({ error: gatewayUnavailableMessage });
    }
  });

  app.post(
    '/whatsapp/gateway/messages/text',
    {
      preHandler: [app.authenticate, requireRoles('owner', 'admin', 'agent'), requirePlan('plus')],
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
    const parsed = GatewayTextSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos' });

    const auth = request.auth!;
    const to = whatsappPhone(parsed.data.to);
    const message = sanitizeText(parsed.data.message, 4096);
    const safety = await checkWhatsAppSendAllowed({ restaurantId: auth.restaurantId, phone: to, message });
    if (!safety.allowed) return reply.code(429).send({ error: safety.reason });

    try {
      const response = await gatewayFetch('/messages/text', {
        method: 'POST',
        body: JSON.stringify({ tenantId: auth.restaurantId, to, message }),
      });

      const body = (await response.json().catch(() => null)) as { messageId?: string } | null;

      if (!response.ok) {
        request.log.warn(
          { restaurantId: auth.restaurantId, gatewayStatus: response.status },
          'WhatsApp Gateway rejected message',
        );
        return reply.code(response.status === 409 ? 409 : 502).send({
          error: response.status === 409 ? 'WhatsApp nao conectado.' : 'Nao foi possivel enviar a mensagem agora.',
        });
      }

      const [existingCustomer] = await db
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.restaurantId, auth.restaurantId),
            or(eq(customers.phone, to), eq(customers.phone, `+${to}`)),
            eq(customers.isDeleted, false),
          ),
        )
        .limit(1);

      const [conversation] = await db
        .insert(whatsappConversations)
        .values({
          restaurantId: auth.restaurantId,
          customerId: existingCustomer?.id ?? null,
          phone: to,
          status: 'open',
          lastMessageAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [whatsappConversations.restaurantId, whatsappConversations.phone],
          set: { customerId: existingCustomer?.id ?? null, lastMessageAt: new Date(), updatedAt: new Date() },
        })
        .returning();

      const [saved] = await db
        .insert(whatsappMessages)
        .values({
          restaurantId: auth.restaurantId,
          conversationId: conversation.id,
          customerId: existingCustomer?.id ?? null,
          phone: to,
          direction: 'outbound',
          body: message,
          provider: 'baileys_gateway',
          providerMessageId: body?.messageId ?? null,
          metadata: {},
        })
        .returning();

      writeAuditLog({
        request,
        restaurantId: auth.restaurantId,
        userId: auth.userId,
        action: 'whatsapp_gateway_message_sent',
        resourceType: 'whatsapp_gateway_message',
        resourceId: saved.id,
        newData: { phone: to, length: message.length, provider: 'baileys_gateway' },
      }).catch((error) => request.log.error({ error }, 'gateway message audit log failed'));

      await recordUsage(auth.restaurantId, 'whatsapp').catch((error) =>
        request.log.warn({ error, restaurantId: auth.restaurantId }, 'whatsapp usage not recorded'),
      );

      return { messageId: saved.id };
    } catch (error) {
      request.log.error({ err: error, restaurantId: auth.restaurantId }, 'WhatsApp Gateway request failed');
      return reply.code(503).send({ error: gatewayUnavailableMessage });
    }
    },
  );

  app.post(
    '/whatsapp/send',
    { preHandler: [app.authenticate, requireRoles('owner', 'admin', 'agent'), requirePlan('plus')] },
    async (request, reply) => {
    const parsed = WhatsAppSendSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos' });

    const auth = request.auth!;
    const input = parsed.data;
    const phone = sanitizePhone(input.phone);
    const message = sanitizeText(input.message, 4096);
    const safety = await checkWhatsAppSendAllowed({ restaurantId: auth.restaurantId, phone, message });
    if (!safety.allowed) return reply.code(429).send({ error: safety.reason });
    let provider = 'manual';
    let providerStatus = 202;
    let providerMessageId: string | null = null;

    if (env.EVOLUTION_API_URL && env.EVOLUTION_API_KEY) {
      const providerResponse = await fetch(`${env.EVOLUTION_API_URL}/message/sendText`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: env.EVOLUTION_API_KEY,
        },
        body: JSON.stringify({ number: phone.replace(/\D/g, ''), text: message }),
      });

      if (!providerResponse.ok) return reply.code(502).send({ error: 'Falha ao enviar mensagem.' });
      const providerBody = await providerResponse.json().catch(() => ({}));
      provider = 'evolution_api';
      providerStatus = providerResponse.status;
      providerMessageId = providerBody?.key?.id ?? providerBody?.id ?? null;
    }

    const [conversation] = await db
      .insert(whatsappConversations)
      .values({
        restaurantId: auth.restaurantId,
        customerId: input.customer_id || null,
        phone,
        status: 'open',
        lastMessageAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [whatsappConversations.restaurantId, whatsappConversations.phone],
        set: { customerId: input.customer_id || null, lastMessageAt: new Date(), updatedAt: new Date() },
      })
      .returning();

    const [saved] = await db
      .insert(whatsappMessages)
      .values({
        restaurantId: auth.restaurantId,
        conversationId: conversation.id,
        customerId: input.customer_id || null,
        phone,
        direction: 'outbound',
        body: message,
        provider,
        providerMessageId,
        metadata: { provider_status: providerStatus },
      })
      .returning();

    writeAuditLog({
      request,
      restaurantId: auth.restaurantId,
      userId: auth.userId,
      action: 'whatsapp_sent',
      resourceType: 'whatsapp_message',
      resourceId: saved.id,
      newData: { phone, length: message.length },
    }).catch((error) => request.log.error({ error }, 'whatsapp audit log failed'));

    if (provider !== 'manual') {
      await recordUsage(auth.restaurantId, 'whatsapp').catch((error) =>
        request.log.warn({ error, restaurantId: auth.restaurantId }, 'whatsapp usage not recorded'),
      );
    }

      return { success: true, message_id: saved.id, queued: provider === 'manual' };
    },
  );

  app.post(
    '/webhooks/whatsapp/:restaurantSlug',
    {
      config: { rateLimit: { max: 100, timeWindow: '1 minute' } },
      preHandler: createWebhookHmacMiddleware({
        getSecret: () => env.WEBHOOK_SECRET,
        replayPrefix: 'whatsapp-provider',
      }),
    },
    async (request, reply) => {
    const rawBody = (request as typeof request & { rawBody?: string }).rawBody || JSON.stringify(request.body ?? {});

    const { restaurantSlug } = request.params as { restaurantSlug: string };
    const [restaurant] = await db
      .select()
      .from(restaurants)
      .where(and(eq(restaurants.slug, restaurantSlug), eq(restaurants.isDeleted, false)))
      .limit(1);
    if (!restaurant) return reply.code(404).send({ error: 'Não encontrado' });

    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    if (isGroupWebhookPayload(payload)) {
      writeAuditLog({
        request,
        restaurantId: restaurant.id,
        userId: null,
        action: 'webhook_group_message_ignored',
        resourceType: 'whatsapp_message',
        newData: { source: 'webhook' },
      }).catch((error) => request.log.error({ error }, 'whatsapp group webhook audit log failed'));

      return { success: true, ignored: true, reason: 'group_message' };
    }

    const phone = whatsappPhone(String(payload.phone ?? payload.from ?? ''));
    const body = sanitizeText(String(payload.message ?? payload.text ?? ''), 4096);
    if (phone.length < 10 || !body) return reply.code(400).send({ error: 'Payload invalido' });

    const [existingCustomer] = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.restaurantId, restaurant.id),
          or(eq(customers.phone, phone), eq(customers.phone, `+${phone}`)),
          eq(customers.isDeleted, false),
        ),
      )
      .limit(1);

    const customer =
      existingCustomer ||
      (
        await db
          .insert(customers)
          .values({
            restaurantId: restaurant.id,
            name: sanitizeText(String(payload.name ?? `Cliente ${phone.slice(-4)}`), 100),
            phone,
            tags: ['WhatsApp'],
            status: 'new',
            origin: 'whatsapp',
          })
          .returning()
      )[0];

    const [conversation] = await db
      .insert(whatsappConversations)
      .values({
        restaurantId: restaurant.id,
        customerId: customer.id,
        phone,
        status: 'open',
        lastMessageAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [whatsappConversations.restaurantId, whatsappConversations.phone],
        set: { lastMessageAt: new Date(), updatedAt: new Date() },
      })
      .returning();

    const [saved] = await db
      .insert(whatsappMessages)
      .values({
        restaurantId: restaurant.id,
        conversationId: conversation.id,
        customerId: customer.id,
        phone,
        direction: 'inbound',
        body,
        provider: 'webhook',
        metadata: {},
      })
      .returning();

    writeAuditLog({
      request,
      restaurantId: restaurant.id,
      userId: null,
      action: 'webhook_message_received',
      resourceType: 'whatsapp_message',
      resourceId: saved.id,
      newData: { phone, length: body.length },
    }).catch((error) => request.log.error({ error }, 'whatsapp webhook audit log failed'));

    return { success: true };
    },
  );
};
