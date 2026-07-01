import { resolveMx } from 'node:dns/promises';
import disposableEmailDomains from 'disposable-email-domains';
import { env } from '../env.js';

const blockedEmailDomains = new Set((disposableEmailDomains as string[]).map((domain) => domain.toLowerCase()));

const domainCache = new Map<string, { checkedAt: number; valid: boolean }>();
const domainCacheTtlMs = 15 * 60 * 1000;
const emailDomainValidationTimeoutMs = 2_500;

const getEmailDomain = (email: string) => email.split('@').at(-1)?.trim().toLowerCase() ?? '';

const isDisposableEmailDomain = (domain: string) => {
  const parts = domain.split('.');
  return parts.some((_, index) => blockedEmailDomains.has(parts.slice(index).join('.')));
};

const resolveMxWithTimeout = async (domain: string) => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      resolveMx(domain),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('email_domain_timeout')), emailDomainValidationTimeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export const validateEmailDomainForSignup = async (email: string) => {
  if (env.NODE_ENV === 'test') return { valid: true as const };

  const domain = getEmailDomain(email);
  if (!domain || !domain.includes('.') || isDisposableEmailDomain(domain)) {
    return { valid: false as const, reason: 'invalid_domain' };
  }

  const cached = domainCache.get(domain);
  if (cached && Date.now() - cached.checkedAt < domainCacheTtlMs) {
    return cached.valid ? { valid: true as const } : { valid: false as const, reason: 'invalid_domain' };
  }

  try {
    const records = await resolveMxWithTimeout(domain);
    const valid = records.some((record) => record.exchange && Number.isFinite(record.priority));
    domainCache.set(domain, { checkedAt: Date.now(), valid });
    return valid ? { valid: true as const } : { valid: false as const, reason: 'invalid_domain' };
  } catch {
    domainCache.set(domain, { checkedAt: Date.now(), valid: false });
    return { valid: false as const, reason: 'invalid_domain' };
  }
};
