import { z } from 'https://esm.sh/zod@3.24.1';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/auth.ts';
import {
  assertFreshTimestamp,
  cleanPhone,
  enforceRateLimit,
  getSourceIp,
  sanitizeText,
  validateWebhookSignature,
} from '../_shared/security.ts';

const WebhookPayloadSchema = z
  .object({
    restaurant_slug: z.string().max(100).optional(),
    phone: z.string().optional(),
    name: z.string().max(100).optional(),
    message: z.string().optional(),
    text: z.string().optional(),
    data: z.unknown().optional(),
  })
  .passthrough();

const getNestedText = (payload: Record<string, unknown>) => {
  const data = payload.data as Record<string, unknown> | undefined;
  const message = data?.message as Record<string, unknown> | undefined;
  const conversation = message?.conversation;
  return typeof conversation === 'string' ? conversation : undefined;
};

const getNestedPhone = (payload: Record<string, unknown>) => {
  const data = payload.data as Record<string, unknown> | undefined;
  const key = data?.key as Record<string, unknown> | undefined;
  const remoteJid = key?.remoteJid;
  return typeof remoteJid === 'string' ? remoteJid.replace('@s.whatsapp.net', '') : undefined;
};

const hasGroupJid = (value: unknown) => typeof value === 'string' && value.includes('@g.us');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const isGroupPayload = (payload: Record<string, unknown>) => {
  const data = isRecord(payload.data) ? payload.data : {};
  const key = isRecord(data.key) ? data.key : isRecord(payload.key) ? payload.key : {};

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const adminSupabase = createAdminClient();
    const sourceIp = getSourceIp(req);
    await enforceRateLimit(adminSupabase, `webhook:${sourceIp}:${Math.floor(Date.now() / 60000)}`, 100, 60);

    if (!assertFreshTimestamp(req)) return jsonResponse({ error: 'Request too old' }, 400);

    const body = await req.text();
    const signature = req.headers.get('x-hub-signature-256') || req.headers.get('x-webhook-signature') || '';
    const secret = Deno.env.get('WEBHOOK_SECRET') || '';
    const valid = await validateWebhookSignature(body, signature, secret);
    if (!valid) return jsonResponse({ error: 'Forbidden' }, 403);

    const payload = WebhookPayloadSchema.parse(JSON.parse(body)) as Record<string, unknown>;
    const restaurantSlug =
      req.headers.get('x-restaurant-slug') ||
      (typeof payload.restaurant_slug === 'string' ? payload.restaurant_slug : undefined);
    if (!restaurantSlug) return jsonResponse({ error: 'Restaurante não identificado' }, 400);

    if (isGroupPayload(payload)) {
      return jsonResponse({ success: true, ignored: true, reason: 'group_message' });
    }

    const { data: restaurant } = await adminSupabase
      .from('restaurants')
      .select('id')
      .eq('slug', restaurantSlug)
      .eq('is_deleted', false)
      .single();

    if (!restaurant?.id) return jsonResponse({ error: 'Restaurante não encontrado' }, 404);

    const rawPhone =
      (typeof payload.phone === 'string' ? payload.phone : undefined) ||
      getNestedPhone(payload);
    const rawMessage =
      (typeof payload.message === 'string' ? payload.message : undefined) ||
      (typeof payload.text === 'string' ? payload.text : undefined) ||
      getNestedText(payload);

    const phone = cleanPhone(rawPhone || '');
    const message = sanitizeText(rawMessage || '', 4096);
    if (phone.length < 10 || !message) return jsonResponse({ error: 'Payload inválido' }, 400);

    const { data: existingCustomer } = await adminSupabase
      .from('customers')
      .select('id')
      .eq('restaurant_id', restaurant.id)
      .eq('phone', phone)
      .maybeSingle();

    let customerId = existingCustomer?.id as string | undefined;
    if (!customerId) {
      const { data: createdCustomer } = await adminSupabase
        .from('customers')
        .insert({
          restaurant_id: restaurant.id,
          name: sanitizeText((payload.name as string | undefined) || `Cliente ${phone.slice(-4)}`, 100),
          phone,
          tags: ['WhatsApp'],
          origin: 'whatsapp',
          status: 'new',
        })
        .select('id')
        .single();
      customerId = createdCustomer?.id;
    }

    const { data: conversation } = await adminSupabase
      .from('whatsapp_conversations')
      .upsert(
        {
          restaurant_id: restaurant.id,
          customer_id: customerId ?? null,
          phone,
          status: 'open',
          last_message_at: new Date().toISOString(),
        },
        { onConflict: 'restaurant_id,phone' },
      )
      .select('id')
      .single();

    const { data: savedMessage } = await adminSupabase
      .from('whatsapp_messages')
      .insert({
        restaurant_id: restaurant.id,
        conversation_id: conversation?.id ?? null,
        customer_id: customerId ?? null,
        phone,
        direction: 'inbound',
        body: message,
        provider: 'webhook',
        metadata: { source_ip: sourceIp },
      })
      .select('id')
      .single();

    await adminSupabase.from('audit_logs').insert({
      restaurant_id: restaurant.id,
      action: 'webhook_message_received',
      resource_type: 'whatsapp_message',
      resource_id: savedMessage?.id ?? null,
      new_data: { phone, length: message.length },
      ip_address: sourceIp === 'unknown' ? null : sourceIp,
      user_agent: req.headers.get('user-agent'),
    });

    return jsonResponse({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'RATE_LIMITED') {
      return jsonResponse({ error: 'Rate limit excedido' }, 429);
    }
    console.error('webhook-receiver error', error);
    return jsonResponse({ error: 'Erro interno. Tente novamente.' }, 500);
  }
});
