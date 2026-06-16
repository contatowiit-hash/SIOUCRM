import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from '../../../env.js';

const GOOMER_API_BASE_URL = 'https://partner-api.goomer.app';
const TOKEN_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.coerce.number().int().positive(),
});

const storedCredentialsSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  accessToken: z.string().min(1).optional(),
  accessTokenCachedAt: z.number().int().positive().optional(),
  accessTokenCacheUntil: z.number().int().positive().optional(),
  accessTokenExpiresAt: z.number().int().positive().optional(),
});

export type GoomerCredentials = z.infer<typeof storedCredentialsSchema>;

export const parseGoomerCredentials = (value: string) => storedCredentialsSchema.parse(JSON.parse(value));

export const serializeGoomerCredentials = (credentials: GoomerCredentials) => JSON.stringify(credentials);

const partnerHeaders = () => {
  const headers: Record<string, string> = {};
  if (env.GOOMER_PARTNER_KEY && env.GOOMER_PARTNER_TOKEN) {
    headers['x-partner-key'] = env.GOOMER_PARTNER_KEY;
    headers['x-partner-token'] = env.GOOMER_PARTNER_TOKEN;
  }
  return headers;
};

const tokenUrl = `${GOOMER_API_BASE_URL}/opendelivery/oauth/token`;

const requestToken = async (clientId: string, clientSecret: string) => {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  }).toString();

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...partnerHeaders(),
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Goomer token request failed with status ${response.status}`);
  }

  return tokenResponseSchema.parse(await response.json());
};

export const exchangeGoomerClientCredentials = async (clientId: string, clientSecret: string) => {
  const token = await requestToken(clientId, clientSecret);
  const now = Date.now();

  return {
    accessToken: token.access_token,
    accessTokenCachedAt: now,
    accessTokenCacheUntil: now + TOKEN_CACHE_TTL_MS,
    accessTokenExpiresAt: now + Math.max(token.expires_in - 60, 60) * 1000,
  };
};

export const createGoomerCredentials = async (clientId: string, clientSecret: string): Promise<GoomerCredentials> => {
  const token = await exchangeGoomerClientCredentials(clientId, clientSecret);
  return { clientId, clientSecret, ...token };
};

export const refreshGoomerCredentialsIfNeeded = async (credentials: GoomerCredentials) => {
  const now = Date.now();
  const cacheStillValid = !credentials.accessTokenCacheUntil || credentials.accessTokenCacheUntil > now;
  if (
    credentials.accessToken &&
    credentials.accessTokenExpiresAt &&
    credentials.accessTokenExpiresAt > now + TOKEN_REFRESH_SKEW_MS &&
    cacheStillValid
  ) {
    return { credentials, refreshed: false };
  }

  const token = await exchangeGoomerClientCredentials(credentials.clientId, credentials.clientSecret);
  return { credentials: { ...credentials, ...token }, refreshed: true };
};

export const validateGoomerCredentials = async (credentials: Pick<GoomerCredentials, 'clientId' | 'clientSecret'>) => {
  const token = await exchangeGoomerClientCredentials(credentials.clientId, credentials.clientSecret);
  return { ...credentials, ...token };
};

const normalizeSignature = (signature: string | undefined) =>
  signature
    ?.trim()
    .replace(/^sha256=/i, '')
    .replace(/^hmac-sha256=/i, '')
    .toLowerCase();

export const verifyGoomerWebhookSignature = (rawBody: string, signature: string | undefined, clientSecret: string) => {
  const normalized = normalizeSignature(signature);
  if (!normalized || !/^[a-f0-9]{64}$/.test(normalized)) return false;

  const expected = createHmac('sha256', clientSecret).update(rawBody).digest('hex');
  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(normalized, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
};

export const fetchGoomerOrder = async (orderId: string, accessToken: string) => {
  const response = await fetch(`${GOOMER_API_BASE_URL}/opendelivery/v1/orders/${encodeURIComponent(orderId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...partnerHeaders(),
    },
  });

  if (!response.ok) {
    throw new Error(`Goomer order request failed with status ${response.status}`);
  }

  return response.json() as Promise<unknown>;
};
