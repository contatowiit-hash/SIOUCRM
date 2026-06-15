import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getAuthenticatedContext } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const context = await getAuthenticatedContext(req);
    if ('error' in context) return jsonResponse({ error: context.error }, context.status);

    const { data: subscription } = await context.supabase
      .from('subscriptions')
      .select('plan, status, expires_at, lifetime')
      .eq('restaurant_id', context.restaurantId)
      .eq('status', 'active')
      .maybeSingle();

    const active =
      subscription?.lifetime === true ||
      (subscription?.expires_at ? new Date(subscription.expires_at) >= new Date() : false);

    if (!active) return jsonResponse({ active: false, error: 'Plano expirado' }, 402);

    return jsonResponse({ active: true, subscription });
  } catch (error) {
    console.error('validate-subscription error', error);
    return jsonResponse({ error: 'Erro interno. Tente novamente.' }, 500);
  }
});
