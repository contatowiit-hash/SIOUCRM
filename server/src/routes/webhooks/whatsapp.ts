import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, eq, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { customers, restaurants, whatsappConversations, whatsappMessages } from '../../db/schema.js';
import { env } from '../../env.js';
import { createWebhookHmacMiddleware } from '../../middleware/verifyWebhookHmac.js';
import { recordUsage } from '../../services/usage.js';
import {
  checkWhatsAppSendAllowed,
  isWhatsAppInboundDuplicate,
  registerWhatsAppOptOut,
} from '../../services/whatsappSafety.js';
import { generateAiSupportReply } from '../../utils/aiSupport.js';
import { writeAuditLog } from '../../utils/audit.js';
import { sanitizeMultilineText, sanitizePhone, sanitizeText } from '../../utils/security.js';

const IncomingMessageSchema = z.object({
  tenantId: z.string().uuid(),
  from: z.string().min(8).max(30),
  fromName: z.string().max(120).nullable().optional(),
  profilePicUrl: z.string().url().nullable().optional(),
  body: z.string().max(4096).default(''),
  messageId: z.string().max(180),
  timestamp: z.number().int().positive(),
  type: z.enum(['text', 'image', 'video', 'audio', 'document', 'sticker', 'other']),
  mediaUrl: z.string().url().optional(),
  isGroup: z.boolean().default(false),
  groupId: z.string().max(120).optional(),
  groupName: z.string().max(120).optional(),
});

const SessionInfoSchema = z.object({
  tenantId: z.string().uuid(),
  status: z.enum(['connecting', 'qr_ready', 'connected', 'disconnected', 'error']),
  qrCode: z.string().nullable().optional(),
  qrString: z.string().nullable().optional(),
  phoneNumber: z.string().nullable().optional(),
  connectedAt: z.string().nullable().optional(),
  lastSeen: z.string().nullable().optional(),
});

const WebhookPayloadSchema = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('message.received'),
    tenantId: z.string().uuid(),
    timestamp: z.number().int().positive(),
    data: IncomingMessageSchema,
  }),
  z.object({
    event: z.literal('session.connected'),
    tenantId: z.string().uuid(),
    timestamp: z.number().int().positive(),
    data: SessionInfoSchema,
  }),
  z.object({
    event: z.literal('session.disconnected'),
    tenantId: z.string().uuid(),
    timestamp: z.number().int().positive(),
    data: z.unknown(),
  }),
  z.object({
    event: z.literal('session.qr'),
    tenantId: z.string().uuid(),
    timestamp: z.number().int().positive(),
    data: z.object({
      qrCode: z.string().max(200_000),
      qrString: z.string().max(10_000),
    }),
  }),
]);

const MetaMessageSchema = z
  .object({
    from: z.string().min(1),
    id: z.string().max(180),
    timestamp: z.string().optional(),
    type: z.string().max(60),
    text: z.object({ body: z.string().optional() }).optional(),
  })
  .passthrough();

const MetaWebhookPayloadSchema = z
  .object({
    entry: z
      .array(
        z
          .object({
            id: z.string().optional(),
            changes: z
              .array(
                z
                  .object({
                    value: z
                      .object({
                        metadata: z
                          .object({
                            phone_number_id: z.string().optional(),
                            display_phone_number: z.string().optional(),
                            waba_id: z.string().optional(),
                          })
                          .passthrough()
                          .optional(),
                        contacts: z.array(z.unknown()).optional(),
                        messages: z.array(MetaMessageSchema).optional(),
                      })
                      .passthrough(),
                  })
                  .passthrough(),
              )
              .optional()
              .default([]),
          })
          .passthrough(),
      )
      .optional()
      .default([]),
  })
  .passthrough();

type RestaurantRow = typeof restaurants.$inferSelect;

const timestampToMs = (timestamp: number) => (timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000);

const whatsappPhone = (value: string) => sanitizePhone(value).replace(/\D/g, '');

const validateRecentTimestamp = (timestamp: number) => {
  const age = Date.now() - timestampToMs(timestamp);
  return Number.isFinite(age) && age <= 5 * 60 * 1000 && age >= -60 * 1000;
};

const getHeader = (request: FastifyRequest, name: string) => {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const getRawBody = (request: FastifyRequest) =>
  (request as FastifyRequest & { rawBody?: string }).rawBody ?? JSON.stringify(request.body ?? {});

const recordAiReplyUsage = async (restaurantId: string, request: FastifyRequest) => {
  await Promise.all([
    recordUsage(restaurantId, 'ai').catch((error) =>
      request.log.warn({ error, restaurantId }, 'ai usage not recorded'),
    ),
    recordUsage(restaurantId, 'whatsapp').catch((error) =>
      request.log.warn({ error, restaurantId }, 'whatsapp usage not recorded'),
    ),
  ]);
};

const asRecord = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const getSettingString = (settings: unknown, keys: string[]) => {
  const record = asRecord(settings);
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

const META_PHONE_KEYS = [
  'whatsapp_phone_number_id',
  'whatsappPhoneNumberId',
  'meta_phone_number_id',
  'metaPhoneNumberId',
  'WHATSAPP_PHONE_NUMBER_ID',
];

const META_WABA_KEYS = ['whatsapp_waba_id', 'whatsappWabaId', 'meta_waba_id', 'metaWabaId', 'WHATSAPP_WABA_ID'];

const findMetaRestaurant = async (phoneNumberId?: string | null, wabaId?: string | null) => {
  const rows = await db.select().from(restaurants).where(eq(restaurants.isDeleted, false));

  const bySettings = rows.find((restaurant) => {
    const storedPhoneNumberId = getSettingString(restaurant.settings, META_PHONE_KEYS);
    const storedWabaId = getSettingString(restaurant.settings, META_WABA_KEYS);
    return (
      Boolean(phoneNumberId && storedPhoneNumberId === phoneNumberId) ||
      Boolean(wabaId && storedWabaId === wabaId)
    );
  });

  if (bySettings) return bySettings;

  const globalPhoneMatches = Boolean(phoneNumberId && env.WHATSAPP_PHONE_NUMBER_ID === phoneNumberId);
  const globalWabaMatches = Boolean(wabaId && env.WHATSAPP_WABA_ID === wabaId);

  if ((globalPhoneMatches || globalWabaMatches) && rows.length === 1) {
    return rows[0];
  }

  return null;
};

const normalizeMetaSignature = (signature: string) => signature.replace(/^sha256=/i, '').trim();

const verifyMetaSignature = (rawBody: string, signature: string | undefined) => {
  const secret = env.META_APP_SECRET;
  if (!secret || !signature) return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const received = normalizeMetaSignature(signature);

  try {
    const left = Buffer.from(expected, 'hex');
    const right = Buffer.from(received, 'hex');
    return left.length === right.length && timingSafeEqual(left, right);
  } catch {
    return false;
  }
};

const createGatewaySignature = (timestamp: string, method: string, path: string, secret: string) =>
  `sha256=${createHmac('sha256', secret).update(`${timestamp}.${method.toUpperCase()}.${path}`).digest('hex')}`;

const sendGatewayText = async (tenantId: string, to: string, message: string) => {
  if (!env.GATEWAY_URL) throw new Error('GATEWAY_URL_NOT_CONFIGURED');

  const path = '/messages/text';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (env.GATEWAY_SECRET) {
    headers['X-Timestamp'] = timestamp;
    headers['X-Gateway-Signature'] = createGatewaySignature(timestamp, 'POST', path, env.GATEWAY_SECRET);
  }

  const response = await fetch(`${env.GATEWAY_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ tenantId, to, message }),
  });

  const body = (await response.json().catch(() => null)) as { messageId?: string; error?: string } | null;
  if (!response.ok) throw new Error(body?.error ?? `GATEWAY_SEND_FAILED_${response.status}`);

  return body?.messageId ?? null;
};

export const sendWhatsAppMessage = async (to: string, text: string) => {
  const accessToken = env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken) throw new Error('WHATSAPP_ACCESS_TOKEN_NOT_CONFIGURED');
  if (!phoneNumberId) throw new Error('WHATSAPP_PHONE_NUMBER_ID_NOT_CONFIGURED');

  const response = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: whatsappPhone(to),
      type: 'text',
      text: { body: sanitizeMultilineText(text, 4096) },
    }),
  });

  const body = (await response.json().catch(() => null)) as
    | { messages?: Array<{ id?: string }>; error?: { message?: string } }
    | null;

  if (!response.ok) throw new Error(body?.error?.message ?? `META_SEND_FAILED_${response.status}`);
  return body?.messages?.[0]?.id ?? null;
};

const getContactName = (contacts: unknown[] | undefined, phone: string) => {
  for (const contact of contacts ?? []) {
    const record = asRecord(contact);
    const contactPhone = whatsappPhone(String(record.wa_id ?? ''));
    if (contactPhone !== phone) continue;

    const profile = asRecord(record.profile);
    const name = typeof profile.name === 'string' ? sanitizeText(profile.name, 100) : '';
    if (name) return name;
  }

  return null;
};

const saveInboundMessage = async ({
  restaurant,
  phone,
  body,
  provider,
  providerMessageId,
  timestamp,
  type,
  request,
  customerName,
  avatarUrl,
  metadata,
}: {
  restaurant: RestaurantRow;
  phone: string;
  body: string;
  provider: string;
  providerMessageId: string;
  timestamp: number;
  type: string;
  request: FastifyRequest;
  customerName?: string | null;
  avatarUrl?: string | null;
  metadata: Record<string, unknown>;
}) => {
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
          name: sanitizeText(customerName || `Cliente ${phone.slice(-4)}`, 100),
          phone,
          avatarUrl: avatarUrl ?? null,
          tags: ['WhatsApp'],
          status: 'new',
          origin: 'whatsapp',
        })
        .returning()
    )[0];

  if (existingCustomer && avatarUrl && existingCustomer.avatarUrl !== avatarUrl) {
    await db
      .update(customers)
      .set({ avatarUrl, updatedAt: new Date() })
      .where(and(eq(customers.id, existingCustomer.id), eq(customers.restaurantId, restaurant.id)));
    customer.avatarUrl = avatarUrl;
  }

  const [conversation] = await db
    .insert(whatsappConversations)
    .values({
      restaurantId: restaurant.id,
      customerId: customer.id,
      phone,
      status: 'open',
      lastMessageAt: new Date(timestampToMs(timestamp)),
    })
    .onConflictDoUpdate({
      target: [whatsappConversations.restaurantId, whatsappConversations.phone],
      set: { customerId: customer.id, lastMessageAt: new Date(timestampToMs(timestamp)), updatedAt: new Date() },
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
      provider,
      providerMessageId,
      metadata: { type, ...metadata },
    })
    .returning();

  writeAuditLog({
    request,
    restaurantId: restaurant.id,
    userId: null,
    action: provider === 'meta_whatsapp_cloud' ? 'meta_whatsapp_message_received' : 'gateway_message_received',
    resourceType: 'whatsapp_message',
    resourceId: saved.id,
    newData: { phone, type, length: body.length, provider },
  }).catch((error) => request.log.error({ error }, 'whatsapp webhook audit failed'));

  const optedOut = await registerWhatsAppOptOut(restaurant.id, phone, body);
  return { customer, conversation, saved, optedOut };
};

const processMetaWebhook = async (request: FastifyRequest, payload: z.infer<typeof MetaWebhookPayloadSchema>) => {
  request.log.info({ source: 'meta_whatsapp_cloud', entries: payload.entry.length }, 'Meta WhatsApp webhook received');

  for (const entry of payload.entry) {
    const entryWabaId = entry.id ?? null;

    for (const change of entry.changes) {
      const value = change.value;
      const phoneNumberId = value.metadata?.phone_number_id ?? null;
      const wabaId = value.metadata?.waba_id ?? entryWabaId;
      const restaurant = await findMetaRestaurant(phoneNumberId, wabaId);

      if (!restaurant) {
        request.log.warn(
          { source: 'meta_whatsapp_cloud', phoneNumberId, wabaId, messages: value.messages?.length ?? 0 },
          'Meta WhatsApp webhook ignored because no restaurant matched',
        );
        continue;
      }

      for (const msg of value.messages ?? []) {
        const phone = whatsappPhone(msg.from);
        const type = sanitizeText(msg.type || 'other', 60);
        const text = type === 'text' ? sanitizeText(msg.text?.body ?? '', 4096) : '';
        const body = sanitizeText(text || `[${type}]`, 4096);
        const timestamp = Number(msg.timestamp) || Math.floor(Date.now() / 1000);

        if (phone.length < 10 || !body) continue;
        if (await isWhatsAppInboundDuplicate(restaurant.id, 'meta_whatsapp_cloud', msg.id)) continue;

        const { customer, conversation, saved, optedOut } = await saveInboundMessage({
          restaurant,
          phone,
          body,
          provider: 'meta_whatsapp_cloud',
          providerMessageId: sanitizeText(msg.id, 180),
          timestamp,
          type,
          request,
          customerName: getContactName(value.contacts, phone),
          metadata: {
            phone_number_id: phoneNumberId,
            waba_id: wabaId,
            source: 'meta_cloud_api',
          },
        });
        if (optedOut) continue;

        try {
          const replyText = await generateAiSupportReply({
            restaurantId: restaurant.id,
            conversationId: conversation.id,
            customerName: customer.name,
            message: body,
          });
          if (!replyText) continue;
          const safety = await checkWhatsAppSendAllowed({ restaurantId: restaurant.id, phone, message: replyText });
          if (!safety.allowed) {
            request.log.info({ restaurantId: restaurant.id, phone, reason: safety.reason }, 'meta auto reply blocked by safety policy');
            continue;
          }

          const providerMessageId = await sendWhatsAppMessage(phone, replyText);
          const [outbound] = await db
            .insert(whatsappMessages)
            .values({
              restaurantId: restaurant.id,
              conversationId: conversation.id,
              customerId: customer.id,
              phone,
              direction: 'outbound',
              body: replyText,
              provider: 'groq_ai',
              providerMessageId,
              metadata: { source: 'groq_meta_auto_reply', inbound_message_id: saved.id },
            })
            .returning();

          await db
            .update(whatsappConversations)
            .set({ lastMessageAt: new Date(), updatedAt: new Date() })
            .where(and(eq(whatsappConversations.id, conversation.id), eq(whatsappConversations.restaurantId, restaurant.id)));

          await recordAiReplyUsage(restaurant.id, request);

          writeAuditLog({
            request,
            restaurantId: restaurant.id,
            userId: null,
            action: 'ai_auto_reply_sent',
            resourceType: 'whatsapp_message',
            resourceId: outbound.id,
            newData: { phone, length: replyText.length, provider: 'groq' },
          }).catch((error) => request.log.error({ error }, 'meta auto reply audit failed'));
        } catch (error) {
          request.log.error({ error, messageId: saved.id }, 'meta auto reply failed');
        }
      }
    }
  }
};

export const whatsappGatewayWebhookRoutes = async (app: FastifyInstance) => {
  const gatewayWebhookPreHandler = createWebhookHmacMiddleware({
    getSecret: () => env.GATEWAY_SECRET ?? env.WEBHOOK_SECRET,
    replayPrefix: 'whatsapp',
  });

  app.get('/webhooks/whatsapp', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const mode = query['hub.mode'];
    const verifyToken = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && verifyToken === env.WHATSAPP_VERIFY_TOKEN && challenge) {
      return reply.code(200).type('text/plain').send(challenge);
    }

    return reply.code(403).send({ error: 'Forbidden' });
  });

  app.post('/webhooks/whatsapp', {
    config: { rateLimit: { max: 100, timeWindow: '1 minute' } },
    preHandler: async (request, reply) => {
      if (getHeader(request, 'x-hub-signature-256')) return;
      return gatewayWebhookPreHandler.call(app, request, reply, () => undefined);
    },
  }, async (request, reply) => {
    const metaSignature = getHeader(request, 'x-hub-signature-256');

    if (metaSignature) {
      const rawBody = getRawBody(request);
      if (!verifyMetaSignature(rawBody, metaSignature)) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const parsed = MetaWebhookPayloadSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Dados invalidos' });
      }

      void processMetaWebhook(request, parsed.data).catch((error) =>
        request.log.error({ error }, 'meta whatsapp webhook processing failed'),
      );

      return reply.code(200).send({ received: true });
    }

    const parsed = WebhookPayloadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Dados invalidos' });
    }

    const payload = parsed.data;
    if (!validateRecentTimestamp(payload.timestamp)) {
      return reply.code(400).send({ error: 'Request too old' });
    }

    const [restaurant] = await db
      .select()
      .from(restaurants)
      .where(and(eq(restaurants.id, payload.tenantId), eq(restaurants.isDeleted, false)))
      .limit(1);

    if (!restaurant) return reply.code(404).send({ error: 'Restaurante nao encontrado' });

    if (payload.event === 'message.received') {
      const msg = payload.data;
      if (msg.isGroup || msg.groupId) {
        writeAuditLog({
          request,
          restaurantId: restaurant.id,
          userId: null,
          action: 'gateway_group_message_ignored',
          resourceType: 'whatsapp_message',
          newData: { group_id: msg.groupId ?? null, type: msg.type },
        }).catch((error) => request.log.error({ error }, 'gateway group ignore audit failed'));

        return reply.code(200).send({ received: true, ignored: true, reason: 'group_message' });
      }

      const phone = whatsappPhone(msg.from);
      const body = sanitizeText(msg.body || `[${msg.type}]`, 4096);
      const avatarUrl = msg.profilePicUrl ?? null;
      if (phone.length < 10 || !body) return reply.code(400).send({ error: 'Payload invalido' });
      if (await isWhatsAppInboundDuplicate(restaurant.id, 'baileys_gateway', msg.messageId)) {
        return reply.code(200).send({ received: true, ignored: true, reason: 'duplicate_message' });
      }

      const { customer, conversation, saved, optedOut } = await saveInboundMessage({
        restaurant,
        phone,
        body,
        provider: 'baileys_gateway',
        providerMessageId: msg.messageId,
        timestamp: msg.timestamp,
        type: msg.type,
        request,
        customerName: msg.fromName ?? null,
        avatarUrl,
        metadata: {
          media_url: msg.mediaUrl ?? null,
          is_group: msg.isGroup,
          group_id: msg.groupId ?? null,
          group_name: msg.groupName ?? null,
        },
      });
      if (optedOut) return reply.code(200).send({ received: true, ignored: true, reason: 'customer_opt_out' });

      generateAiSupportReply({
        restaurantId: restaurant.id,
        conversationId: conversation.id,
        customerName: customer.name,
        message: body,
      })
        .then(async (aiReply) => {
          if (!aiReply) return;
          const safety = await checkWhatsAppSendAllowed({ restaurantId: restaurant.id, phone, message: aiReply });
          if (!safety.allowed) {
            request.log.info({ restaurantId: restaurant.id, phone, reason: safety.reason }, 'gateway auto reply blocked by safety policy');
            return;
          }

          const providerMessageId = await sendGatewayText(restaurant.id, phone, aiReply);
          const [outbound] = await db
            .insert(whatsappMessages)
            .values({
              restaurantId: restaurant.id,
              conversationId: conversation.id,
              customerId: customer.id,
              phone,
              direction: 'outbound',
              body: aiReply,
              provider: 'groq_ai',
              providerMessageId,
              metadata: { source: 'groq_auto_reply', inbound_message_id: saved.id },
            })
            .returning();

          await db
            .update(whatsappConversations)
            .set({ lastMessageAt: new Date(), updatedAt: new Date() })
            .where(and(eq(whatsappConversations.id, conversation.id), eq(whatsappConversations.restaurantId, restaurant.id)));

          await recordAiReplyUsage(restaurant.id, request);

          writeAuditLog({
            request,
            restaurantId: restaurant.id,
            userId: null,
            action: 'ai_auto_reply_sent',
            resourceType: 'whatsapp_message',
            resourceId: outbound.id,
            newData: { phone, length: aiReply.length, provider: 'groq' },
          }).catch((error) => request.log.error({ error }, 'ai auto reply audit failed'));
        })
        .catch((error) => request.log.error({ error, messageId: saved.id }, 'ai auto reply failed'));
    }

    if (payload.event === 'session.connected' || payload.event === 'session.disconnected' || payload.event === 'session.qr') {
      writeAuditLog({
        request,
        restaurantId: restaurant.id,
        userId: null,
        action: `gateway_${payload.event.replace('.', '_')}`,
        resourceType: 'whatsapp_session',
        newData: {
          event: payload.event,
          phone: payload.event === 'session.connected' ? payload.data.phoneNumber : undefined,
        },
      }).catch((error) => request.log.error({ error }, 'gateway session audit failed'));
    }

    return reply.code(200).send({ received: true });
  });
};
