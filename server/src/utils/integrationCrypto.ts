import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../env.js';

const VERSION = 'v1';

const getSecret = () => {
  if (!env.INTEGRATION_ENCRYPTION_KEY) {
    throw new Error('Integration encryption is not configured');
  }
  return env.INTEGRATION_ENCRYPTION_KEY;
};

const getKey = () => createHash('sha256').update(getSecret()).digest();

export const encryptIntegrationSecret = (value: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
};

export const decryptIntegrationSecret = (value: string) => {
  const [version, ivValue, tagValue, encryptedValue] = value.split('.');
  if (version !== VERSION || !ivValue || !tagValue || !encryptedValue) {
    throw new Error('Invalid encrypted integration credential');
  }

  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8');
};

export const createIntegrationState = (restaurantId: string, provider: string) => {
  const payload = Buffer.from(
    JSON.stringify({ restaurantId, provider, expiresAt: Date.now() + 10 * 60 * 1000, nonce: randomBytes(16).toString('hex') }),
  ).toString('base64url');
  const signature = createHmac('sha256', getSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
};

export const verifyIntegrationState = (state: string) => {
  try {
    const [payload, received] = state.split('.');
    if (!payload || !received) return null;
    const expected = createHmac('sha256', getSecret()).update(payload).digest('base64url');
    const left = Buffer.from(expected);
    const right = Buffer.from(received);
    if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      restaurantId?: unknown;
      provider?: unknown;
      expiresAt?: unknown;
    };
    if (
      typeof parsed.restaurantId !== 'string' ||
      typeof parsed.provider !== 'string' ||
      typeof parsed.expiresAt !== 'number' ||
      parsed.expiresAt < Date.now()
    ) {
      return null;
    }
    return { restaurantId: parsed.restaurantId, provider: parsed.provider };
  } catch {
    return null;
  }
};
