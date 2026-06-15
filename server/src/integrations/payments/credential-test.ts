import { env } from '../../env.js';

export type OwnCredentialProvider = 'mercado_pago' | 'pagbank' | 'cielo' | 'getnet';

export type OwnPaymentCredentials = {
  accessToken?: string;
  merchantId?: string;
  merchantKey?: string;
  sellerId?: string;
  clientId?: string;
  clientSecret?: string;
};

const requireAcceptedCredential = async (response: Response, provider: string) => {
  if (response.status === 401 || response.status === 403) throw new Error(`${provider} credential rejected`);
  if (response.status >= 500) throw new Error(`${provider} is unavailable`);
};

export const testOwnPaymentCredentials = async (
  provider: OwnCredentialProvider,
  credentials: OwnPaymentCredentials,
): Promise<{ externalAccountId?: string }> => {
  if (provider === 'mercado_pago') {
    const response = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    });
    await requireAcceptedCredential(response, 'Mercado Pago');
    if (!response.ok) throw new Error('Mercado Pago credential rejected');
    const body = (await response.json().catch(() => null)) as { id?: string | number } | null;
    return { externalAccountId: body?.id == null ? undefined : String(body.id) };
  }

  if (provider === 'pagbank') {
    const baseUrl =
      env.PAGBANK_API_BASE_URL ??
      (env.NODE_ENV === 'production' ? 'https://api.pagseguro.com' : 'https://sandbox.api.pagseguro.com');
    const response = await fetch(`${baseUrl}/orders?limit=1`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${credentials.accessToken}` },
    });
    await requireAcceptedCredential(response, 'PagBank');
    return {};
  }

  if (provider === 'cielo') {
    const baseUrl =
      env.NODE_ENV === 'production'
        ? 'https://apiquery.cieloecommerce.cielo.com.br'
        : 'https://apiquerysandbox.cieloecommerce.cielo.com.br';
    const response = await fetch(`${baseUrl}/1/sales/00000000-0000-0000-0000-000000000000`, {
      headers: {
        Accept: 'application/json',
        MerchantId: credentials.merchantId ?? '',
        MerchantKey: credentials.merchantKey ?? '',
      },
    });
    await requireAcceptedCredential(response, 'Cielo');
    return { externalAccountId: credentials.merchantId };
  }

  const basic = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64');
  const response = await fetch('https://api.getnet.com.br/auth/oauth/v2/token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ scope: 'oob', grant_type: 'client_credentials' }),
  });
  await requireAcceptedCredential(response, 'Getnet');
  if (!response.ok) throw new Error('Getnet credential rejected');
  const body = (await response.json().catch(() => null)) as { access_token?: string } | null;
  if (!body?.access_token) throw new Error('Getnet credential rejected');
  return { externalAccountId: credentials.sellerId };
};
