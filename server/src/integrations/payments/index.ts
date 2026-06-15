import type { NormalizedTransaction } from '../shared/types.js';
import { normalizeCieloPayment, verifyCieloSignature } from './cielo/adapter.js';
import { normalizeGetnetPayment, verifyGetnetSignature } from './getnet/adapter.js';
import { normalizeInfinitePayPayment, verifyInfinitePaySignature } from './infinitepay/adapter.js';
import { normalizePagBankPayment, verifyPagBankSignature } from './pagbank/adapter.js';
import { getRemainingProviderConfig, remainingPaymentProviders, type RemainingPaymentProvider } from './provider-config.js';
import { normalizeRedePayment, verifyRedeSignature } from './rede/adapter.js';
import { normalizeSafraPayPayment, verifySafraPaySignature } from './safrapay/adapter.js';
import { normalizeStonePayment, verifyStoneSignature } from './stone/adapter.js';
import { normalizeTonPayment, verifyTonSignature } from './ton/adapter.js';

type RemainingPaymentAdapter = {
  normalize: (payload: unknown, restaurantId: string) => NormalizedTransaction;
  verify: (rawBody: string, signature: string | undefined, secret: string | undefined) => boolean;
};

export { getRemainingProviderConfig, remainingPaymentProviders };
export type { RemainingPaymentProvider };

export const remainingPaymentAdapters: Record<RemainingPaymentProvider, RemainingPaymentAdapter> = {
  stone: { normalize: normalizeStonePayment, verify: verifyStoneSignature },
  pagbank: { normalize: normalizePagBankPayment, verify: verifyPagBankSignature },
  cielo: { normalize: normalizeCieloPayment, verify: verifyCieloSignature },
  getnet: { normalize: normalizeGetnetPayment, verify: verifyGetnetSignature },
  rede: { normalize: normalizeRedePayment, verify: verifyRedeSignature },
  ton: { normalize: normalizeTonPayment, verify: verifyTonSignature },
  safrapay: { normalize: normalizeSafraPayPayment, verify: verifySafraPaySignature },
  infinitepay: { normalize: normalizeInfinitePayPayment, verify: verifyInfinitePaySignature },
};
