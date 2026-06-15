import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';

export const sanitizeText = (value: string, maxLength = 4096) =>
  value
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);

export const cleanPhone = (value: string) => value.replace(/[^\d+]/g, '').replace(/^00/, '+').slice(0, 16);

const hexToBytes = (hex: string) => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(hex.substring(index * 2, index * 2 + 2), 16);
  }
  return bytes;
};

export const validateWebhookSignature = async (payload: string, signature: string, secret: string) => {
  if (!signature || !secret) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'verify',
  ]);
  const cleanSignature = signature.replace('sha256=', '').trim();
  if (!/^[a-fA-F0-9]{64}$/.test(cleanSignature)) return false;
  return crypto.subtle.verify('HMAC', key, hexToBytes(cleanSignature), encoder.encode(payload));
};

export const assertFreshTimestamp = (req: Request) => {
  const timestamp = req.headers.get('x-timestamp');
  if (!timestamp) return true;
  const age = Date.now() - Number.parseInt(timestamp, 10) * 1000;
  return Number.isFinite(age) && age <= 5 * 60 * 1000 && age >= -60 * 1000;
};

export const enforceRateLimit = async (
  adminSupabase: SupabaseClient,
  key: string,
  max: number,
  windowSeconds: number,
) => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowSeconds * 1000);
  const { data } = await adminSupabase.from('rate_limits').select('*').eq('key', key).maybeSingle();

  if (!data || new Date(data.expires_at) <= now) {
    await adminSupabase.from('rate_limits').upsert({
      key,
      count: 1,
      window_start: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    });
    return;
  }

  if (data.count >= max) throw new Error('RATE_LIMITED');

  await adminSupabase
    .from('rate_limits')
    .update({ count: data.count + 1 })
    .eq('key', key);
};

export const getSourceIp = (req: Request) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  req.headers.get('cf-connecting-ip') ||
  req.headers.get('x-real-ip') ||
  'unknown';
