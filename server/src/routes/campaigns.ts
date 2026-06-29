import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { campaigns, customers, whatsappConversations, whatsappMessages } from '../db/schema.js';
import { env } from '../env.js';
import { requirePlan } from '../middleware/requirePlan.js';
import { requireRoles } from '../plugins/auth.js';
import { CreateCampaignSchema } from '../schemas.js';
import { recordUsage } from '../services/usage.js';
import { checkWhatsAppSendAllowed } from '../services/whatsappSafety.js';
import { writeAuditLog } from '../utils/audit.js';
import { toCampaignDto } from '../utils/format.js';
import { sanitizeMultilineText, sanitizePhone, sanitizeText } from '../utils/security.js';
import { sendWhatsAppMessage } from './webhooks/whatsapp.js';

const campaignSendLimit = 25;

const whatsappPhone = (value: string) => sanitizePhone(value).replace(/\D/g, '');

const createGatewaySignature = (timestamp: string, method: string, path: string, secret: string) =>
  `sha256=${createHmac('sha256', secret).update(`${timestamp}.${method.toUpperCase()}.${path}`).digest('hex')}`;

const sendGatewayCampaignMessage = async (restaurantId: string, to: string, message: string) => {
  if (!env.GATEWAY_URL) throw new Error('GATEWAY_URL_NOT_CONFIGURED');

  const path = '/messages/text';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (env.GATEWAY_SECRET) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    headers['X-Timestamp'] = timestamp;
    headers['X-Gateway-Signature'] = createGatewaySignature(timestamp, 'POST', path, env.GATEWAY_SECRET);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);

  try {
    const response = await fetch(`${env.GATEWAY_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ tenantId: restaurantId, to, message }),
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as { messageId?: string } | null;
    if (!response.ok) throw new Error(`GATEWAY_SEND_FAILED_${response.status}`);
    return body?.messageId ?? null;
  } finally {
    clearTimeout(timeout);
  }
};

const sendEvolutionCampaignMessage = async (to: string, message: string) => {
  if (!env.EVOLUTION_API_URL || !env.EVOLUTION_API_KEY) throw new Error('EVOLUTION_NOT_CONFIGURED');

  const response = await fetch(`${env.EVOLUTION_API_URL}/message/sendText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.EVOLUTION_API_KEY,
    },
    body: JSON.stringify({ number: to, text: message }),
  });
  const body = (await response.json().catch(() => null)) as { key?: { id?: string }; id?: string } | null;
  if (!response.ok) throw new Error(`EVOLUTION_SEND_FAILED_${response.status}`);
  return body?.key?.id ?? body?.id ?? null;
};

const hasWhatsAppProvider = () =>
  Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) ||
  Boolean(env.GATEWAY_URL) ||
  Boolean(env.EVOLUTION_API_URL && env.EVOLUTION_API_KEY);

const sendCampaignMessage = async ({
  restaurantId,
  to,
  message,
}: {
  restaurantId: string;
  to: string;
  message: string;
}) => {
  if (env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) {
    return { provider: 'meta_cloud_campaign', providerMessageId: await sendWhatsAppMessage(to, message) };
  }

  if (env.GATEWAY_URL) {
    return {
      provider: 'baileys_gateway_campaign',
      providerMessageId: await sendGatewayCampaignMessage(restaurantId, to, message),
    };
  }

  return { provider: 'evolution_campaign', providerMessageId: await sendEvolutionCampaignMessage(to, message) };
};

export const campaignRoutes = async (app: FastifyInstance) => {
  app.get(
    '/campaigns',
    { preHandler: [app.authenticate, requireRoles('owner', 'admin', 'manager'), requirePlan('plus')] },
    async (request) => {
      const auth = request.auth!;
      const rows = await db
        .select()
        .from(campaigns)
        .where(and(eq(campaigns.restaurantId, auth.restaurantId), eq(campaigns.isDeleted, false)))
        .orderBy(desc(campaigns.createdAt))
        .limit(500);
      return { data: rows.map(toCampaignDto) };
    },
  );

  app.post(
    '/campaigns',
    { preHandler: [app.authenticate, requireRoles('owner', 'admin', 'manager'), requirePlan('plus')] },
    async (request, reply) => {
      const parsed = CreateCampaignSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'Dados invalidos' });
      const auth = request.auth!;
      const input = parsed.data;
      const [created] = await db
        .insert(campaigns)
        .values({
          restaurantId: auth.restaurantId,
          name: sanitizeText(input.name, 120),
          type: input.type,
          audience: sanitizeText(input.audience, 160),
          message: sanitizeMultilineText(input.message, 4096),
          channel: input.channel,
          scheduledAt: input.scheduled_at ? new Date(input.scheduled_at) : null,
          status: input.scheduled_at ? 'scheduled' : 'draft',
        })
        .returning();

      await writeAuditLog({
        request,
        restaurantId: auth.restaurantId,
        userId: auth.userId,
        action: 'campaign_created',
        resourceType: 'campaign',
        resourceId: created.id,
        newData: { name: created.name, audience: created.audience },
      });

      return reply.code(201).send({ data: toCampaignDto(created) });
    },
  );

  app.post(
    '/campaigns/:id/send',
    {
      preHandler: [app.authenticate, requireRoles('owner', 'admin', 'manager'), requirePlan('plus')],
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: 'Campanha invalida.' });
      if (!hasWhatsAppProvider()) return reply.code(503).send({ error: 'WhatsApp nao configurado para envio.' });

      const auth = request.auth!;
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(and(eq(campaigns.id, params.data.id), eq(campaigns.restaurantId, auth.restaurantId), eq(campaigns.isDeleted, false)))
        .limit(1);

      if (!campaign) return reply.code(404).send({ error: 'Campanha nao encontrada.' });
      if (campaign.channel !== 'whatsapp') return reply.code(422).send({ error: 'Esta campanha nao usa WhatsApp.' });
      if (campaign.status === 'sending') return reply.code(409).send({ error: 'Esta campanha ja esta sendo enviada.' });

      const message = sanitizeMultilineText(campaign.message, 4096);
      if (!message) return reply.code(400).send({ error: 'Escreva a mensagem da campanha antes de enviar.' });

      await db
        .update(campaigns)
        .set({ status: 'sending', updatedAt: new Date() })
        .where(and(eq(campaigns.id, campaign.id), eq(campaigns.restaurantId, auth.restaurantId)));

      const recipients = await db
        .select({ id: customers.id, phone: customers.phone })
        .from(customers)
        .where(and(eq(customers.restaurantId, auth.restaurantId), eq(customers.isDeleted, false)))
        .orderBy(desc(customers.updatedAt))
        .limit(500);

      let sent = 0;
      let skipped = 0;
      let failed = 0;

      for (const recipient of recipients) {
        if (sent >= campaignSendLimit) {
          skipped += 1;
          continue;
        }

        const phone = whatsappPhone(recipient.phone);
        if (phone.length < 10 || phone.length > 15) {
          skipped += 1;
          continue;
        }

        const safety = await checkWhatsAppSendAllowed({ restaurantId: auth.restaurantId, phone, message });
        if (!safety.allowed) {
          skipped += 1;
          continue;
        }

        try {
          const { provider, providerMessageId } = await sendCampaignMessage({ restaurantId: auth.restaurantId, to: phone, message });
          const [conversation] = await db
            .insert(whatsappConversations)
            .values({
              restaurantId: auth.restaurantId,
              customerId: recipient.id,
              phone,
              status: 'open',
              lastMessageAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [whatsappConversations.restaurantId, whatsappConversations.phone],
              set: { customerId: recipient.id, lastMessageAt: new Date(), updatedAt: new Date() },
            })
            .returning();

          await db.insert(whatsappMessages).values({
            restaurantId: auth.restaurantId,
            conversationId: conversation.id,
            customerId: recipient.id,
            phone,
            direction: 'outbound',
            body: message,
            provider,
            providerMessageId,
            metadata: { campaign_id: campaign.id },
          });

          await recordUsage(auth.restaurantId, 'whatsapp').catch((error) =>
            request.log.warn({ error, restaurantId: auth.restaurantId }, 'campaign whatsapp usage not recorded'),
          );
          sent += 1;
        } catch (error) {
          failed += 1;
          request.log.warn({ error, restaurantId: auth.restaurantId, campaignId: campaign.id }, 'campaign whatsapp send failed');
        }
      }

      const [updated] = await db
        .update(campaigns)
        .set({
          status: sent > 0 ? 'sent' : 'draft',
          sentCount: sql`${campaigns.sentCount} + ${sent}`,
          updatedAt: new Date(),
        })
        .where(and(eq(campaigns.id, campaign.id), eq(campaigns.restaurantId, auth.restaurantId)))
        .returning();

      await writeAuditLog({
        request,
        restaurantId: auth.restaurantId,
        userId: auth.userId,
        action: 'campaign_sent',
        resourceType: 'campaign',
        resourceId: campaign.id,
        newData: { sent, skipped, failed, limit: campaignSendLimit },
      });

      if (sent === 0) {
        return reply.code(422).send({
          error: 'Nenhum cliente estava liberado para envio seguro agora.',
          sent,
          skipped,
          failed,
          limit: campaignSendLimit,
          data: toCampaignDto(updated),
        });
      }

      return { data: toCampaignDto(updated), sent, skipped, failed, limit: campaignSendLimit };
    },
  );
};
