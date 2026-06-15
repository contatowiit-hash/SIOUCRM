import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';

export const createAuthedClient = (authHeader: string) =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

export const createAdminClient = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export const getAuthenticatedContext = async (req: Request) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { error: 'Unauthorized' as const, status: 401 as const };

  const supabase = createAuthedClient(authHeader);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return { error: 'Unauthorized' as const, status: 401 as const };

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('restaurant_id, role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.restaurant_id) return { error: 'Forbidden' as const, status: 403 as const };

  return {
    supabase,
    user,
    restaurantId: profile.restaurant_id as string,
    role: profile.role as string,
  };
};
