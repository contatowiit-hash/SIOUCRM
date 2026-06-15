import { z } from 'https://esm.sh/zod@3.24.1';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createAdminClient, getAuthenticatedContext } from '../_shared/auth.ts';
import { cleanPhone, enforceRateLimit, sanitizeText } from '../_shared/security.ts';

const SendWhatsAppSchema = z.object({
  customer_id: z.string().uuid().optional(),
  phone: z.string().regex(/^\+?[1-9]\d{7,14}$/),
  message: z.string().min(1).max(4096),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const context = await getAuthenticatedContext(req);
    if ('error' in context) return jsonResponse({ error: context.error }, context.status);

    const parsed = SendWhatsAppSchema.safeParse(await req.json());
    if (!parsed.success) {
      return jsonResponse({ error: 'Dados inválidos', details: parsed.error.flatten() }, 400);
    }

    const adminSupabase = createAdminClient();
    await enforceRateLimit(adminSupabase, `api:${context.restaurantId}:send-whatsapp`, 200, 60);
    await enforceRateLimit(adminSupabase, `campaign:${context.restaurantId}:whatsapp`, 1000, 24 * 60 * 60);

    const { data: subscription } = await adminSupabase
      .from('subscriptions')
      .select('plan, status, expires_at, lifetime')
      .eq('restaurant_id', context.restaurantId)
      .eq('status', 'active')
      .maybeSingle();

    const activeSubscription =
      subscription?.lifetime === true ||
      (subscription?.expires_at ? new Date(subscription.expires_at) >= new Date() : false);

    if (!activeSubscription) return jsonResponse({ error: 'Plano expirado' }, 402);

    const phone = cleanPhone(parsed.data.phone);
    const message = sanitizeText(parsed.data.message, 4096);
    if (phone.length < 10 || phone.length > 16) return jsonResponse({ error: 'Telefone inválido' }, 400);

    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
    if (!evolutionUrl || !evolutionKey) return jsonResponse({ error: 'Integração WhatsApp não configurada' }, 503);

    const response = await fetch(`${evolutionUrl}/message/sendText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: evolutionKey,
      },
      body: JSON.stringify({
        number: phone.replace(/\D/g, ''),
        text: message,
      }),
    });

    if (!response.ok) return jsonResponse({ error: 'Falha ao enviar mensagem' }, 502);
    const providerResult = await response.json().catch(() => ({}));

    const { data: conversation } = await adminSupabase
      .from('whatsapp_conversations')
      .upsert(
        {
          restaurant_id: context.restaurantId,
          customer_id: parsed.data.customer_id ?? null,
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
        restaurant_id: context.restaurantId,
        conversation_id: conversation?.id ?? null,
        customer_id: parsed.data.customer_id ?? null,
        phone,
        direction: 'outbound',
        body: message,
        provider: 'evolution_api',
        provider_message_id: providerResult?.key?.id ?? providerResult?.id ?? null,
        metadata: { provider_status: response.status },
      })
      .select('id')
      .single();

    await adminSupabase.from('audit_logs').insert({
      restaurant_id: context.restaurantId,
      user_id: context.user.id,
      action: 'whatsapp_sent',
      resource_type: 'whatsapp_message',
      resource_id: savedMessage?.id ?? null,
      new_data: { phone, length: message.length, provider: 'evolution_api' },
      user_agent: req.headers.get('user-agent'),
    });

    return jsonResponse({ success: true, message_id: savedMessage?.id ?? null });
  } catch (error) {
    if (error instanceof Error && error.message === 'RATE_LIMITED') {
      return jsonResponse({ error: 'Muitas solicitações. Tente novamente em instantes.' }, 429);
    }
    console.error('send-whatsapp error', error);
    return jsonResponse({ error: 'Erro interno. Tente novamente.' }, 500);
  }
});
