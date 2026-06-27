import { randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { emailVerificationTokens } from '../db/schema.js';
import { sha256 } from '../utils/security.js';

const verificationTtlMs = 24 * 60 * 60 * 1000;
const resendCooldownMs = 2 * 60 * 1000;

export const generateVerificationToken = async (userId: string) => {
  const token = randomBytes(32).toString('hex');
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + verificationTtlMs);

  await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId));
  await db.insert(emailVerificationTokens).values({ userId, tokenHash, expiresAt });

  return token;
};

export const hasRecentVerificationToken = async (userId: string) => {
  const cooldownStartedAt = new Date(Date.now() - resendCooldownMs);
  const [recent] = await db
    .select({ id: emailVerificationTokens.id })
    .from(emailVerificationTokens)
    .where(and(eq(emailVerificationTokens.userId, userId), gt(emailVerificationTokens.createdAt, cooldownStartedAt)))
    .limit(1);

  return Boolean(recent);
};
