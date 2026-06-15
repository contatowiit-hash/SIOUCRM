import { env } from '../env.js';

export const isDeveloperEmail = (email: string | null | undefined) =>
  Boolean(env.DEV_ACCOUNT_EMAIL && email?.toLowerCase() === env.DEV_ACCOUNT_EMAIL.toLowerCase());

export const isDeveloperPassword = (email: string | null | undefined, password: string) =>
  env.NODE_ENV !== 'production' &&
  isDeveloperEmail(email) &&
  Boolean(env.DEV_ACCOUNT_PASSWORD && password === env.DEV_ACCOUNT_PASSWORD);
