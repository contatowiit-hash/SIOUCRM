import { env } from '../../env.js';

export const remainingPaymentProviders = ['stone', 'pagbank', 'cielo', 'getnet', 'rede', 'ton', 'safrapay', 'infinitepay'] as const;
export type RemainingPaymentProvider = (typeof remainingPaymentProviders)[number];

const providerNames: Record<RemainingPaymentProvider, string> = {
  stone: 'Stone',
  pagbank: 'PagBank',
  cielo: 'Cielo',
  getnet: 'Getnet',
  rede: 'Rede',
  ton: 'Ton',
  safrapay: 'SafraPay',
  infinitepay: 'InfinitePay',
};

const credentials: Record<RemainingPaymentProvider, { clientId?: string; clientSecret?: string; webhookSecret?: string }> = {
  stone: { clientId: env.STONE_CLIENT_ID, clientSecret: env.STONE_CLIENT_SECRET, webhookSecret: env.STONE_WEBHOOK_SECRET },
  pagbank: { clientId: env.PAGBANK_CLIENT_ID, clientSecret: env.PAGBANK_CLIENT_SECRET, webhookSecret: env.PAGBANK_WEBHOOK_SECRET },
  cielo: { clientId: env.CIELO_CLIENT_ID, clientSecret: env.CIELO_CLIENT_SECRET, webhookSecret: env.CIELO_WEBHOOK_SECRET },
  getnet: { clientId: env.GETNET_CLIENT_ID, clientSecret: env.GETNET_CLIENT_SECRET, webhookSecret: env.GETNET_WEBHOOK_SECRET },
  rede: { clientId: env.REDE_CLIENT_ID, clientSecret: env.REDE_CLIENT_SECRET, webhookSecret: env.REDE_WEBHOOK_SECRET },
  ton: { clientId: env.TON_CLIENT_ID, clientSecret: env.TON_CLIENT_SECRET, webhookSecret: env.TON_WEBHOOK_SECRET },
  safrapay: { clientId: env.SAFRAPAY_CLIENT_ID, clientSecret: env.SAFRAPAY_CLIENT_SECRET, webhookSecret: env.SAFRAPAY_WEBHOOK_SECRET },
  infinitepay: { clientId: env.INFINITEPAY_CLIENT_ID, clientSecret: env.INFINITEPAY_CLIENT_SECRET, webhookSecret: env.INFINITEPAY_WEBHOOK_SECRET },
};

export const getRemainingProviderConfig = (provider: RemainingPaymentProvider) => ({
  provider,
  name: providerNames[provider],
  configured: Boolean(credentials[provider].clientId && credentials[provider].clientSecret && credentials[provider].webhookSecret),
  webhookSecret: credentials[provider].webhookSecret,
});
