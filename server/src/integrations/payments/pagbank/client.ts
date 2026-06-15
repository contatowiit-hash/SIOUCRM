import { env } from '../../../env.js';

const apiBaseUrl = () =>
  env.PAGBANK_API_BASE_URL ?? (env.NODE_ENV === 'production' ? 'https://api.pagseguro.com' : 'https://sandbox.api.pagseguro.com');

export const pagBankConnectBaseUrl = () =>
  env.PAGBANK_CONNECT_BASE_URL ??
  (env.NODE_ENV === 'production' ? 'https://connect.pagbank.com.br' : 'https://sandbox.connect.pagbank.com.br');

const pagBankFetch = async <T>(path: string, accessToken: string, init: RequestInit = {}) => {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error('PagBank request failed');
  return body as T;
};

export const exchangePagBankCode = async (code: string) => {
  if (!env.PAGBANK_CLIENT_ID || !env.PAGBANK_CLIENT_SECRET || !env.PAGBANK_REDIRECT_URI) {
    throw new Error('PagBank OAuth is not configured');
  }
  const response = await fetch(`${apiBaseUrl()}/oauth2/token`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      client_id: env.PAGBANK_CLIENT_ID,
      client_secret: env.PAGBANK_CLIENT_SECRET,
      redirect_uri: env.PAGBANK_REDIRECT_URI,
    }),
  });
  const body = (await response.json().catch(() => null)) as
    | { access_token?: string; refresh_token?: string; account_id?: string; id?: string }
    | null;
  if (!response.ok || !body?.access_token) throw new Error('PagBank OAuth exchange failed');
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    externalAccountId: body.account_id ?? body.id ?? null,
  };
};

export const createPagBankPix = ({
  accessToken,
  orderId,
  amount,
  customerName,
  customerEmail,
  notificationUrl,
}: {
  accessToken: string;
  orderId: string;
  amount: number;
  customerName: string;
  customerEmail: string;
  notificationUrl: string;
}) =>
  pagBankFetch<Record<string, unknown>>('/orders', accessToken, {
    method: 'POST',
    headers: { 'x-idempotency-key': `syntra-order-${orderId}` },
    body: JSON.stringify({
      reference_id: orderId,
      customer: { name: customerName, email: customerEmail },
      items: [{ reference_id: orderId, name: `Pedido ${orderId}`, quantity: 1, unit_amount: Math.round(amount * 100) }],
      qr_codes: [{ amount: { value: Math.round(amount * 100) } }],
      notification_urls: [notificationUrl],
    }),
  });

export const getPagBankOrder = (orderId: string, accessToken: string) =>
  pagBankFetch<Record<string, unknown>>(`/orders/${encodeURIComponent(orderId)}`, accessToken);
