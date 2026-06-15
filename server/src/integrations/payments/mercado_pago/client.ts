import { env } from '../../../env.js';
import { redactSensitiveText } from '../../../utils/logger.js';

const mercadoPagoFetch = async <T>(path: string, accessToken: string, init: RequestInit = {}) => {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...init.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as T | { message?: string } | null;
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'message' in body ? String(body.message) : 'Mercado Pago request failed';
    throw new Error(redactSensitiveText(message));
  }
  return body as T;
};

export const exchangeMercadoPagoCode = async (code: string) => {
  if (!env.MERCADO_PAGO_CLIENT_ID || !env.MERCADO_PAGO_CLIENT_SECRET || !env.MERCADO_PAGO_REDIRECT_URI) {
    throw new Error('Mercado Pago OAuth is not configured');
  }
  const response = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.MERCADO_PAGO_CLIENT_ID,
      client_secret: env.MERCADO_PAGO_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: env.MERCADO_PAGO_REDIRECT_URI,
    }),
  });
  const body = (await response.json().catch(() => null)) as
    | { access_token?: string; refresh_token?: string; user_id?: number | string }
    | null;
  if (!response.ok || !body?.access_token || body.user_id == null) throw new Error('Mercado Pago OAuth exchange failed');
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    externalAccountId: String(body.user_id),
  };
};

export const getMercadoPagoPayment = (paymentId: string, accessToken: string) =>
  mercadoPagoFetch<Record<string, unknown>>(`/v1/payments/${encodeURIComponent(paymentId)}`, accessToken);

export const createMercadoPagoPix = ({
  accessToken,
  orderId,
  amount,
  payerEmail,
  description,
}: {
  accessToken: string;
  orderId: string;
  amount: number;
  payerEmail: string;
  description: string;
}) =>
  mercadoPagoFetch<Record<string, unknown>>('/v1/payments', accessToken, {
    method: 'POST',
    headers: { 'X-Idempotency-Key': `syntra-order-${orderId}` },
    body: JSON.stringify({
      transaction_amount: amount,
      description,
      payment_method_id: 'pix',
      external_reference: orderId,
      payer: { email: payerEmail },
    }),
  });
