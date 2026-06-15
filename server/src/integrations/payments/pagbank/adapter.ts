import { normalizeGenericPaymentPayload, verifyGenericPaymentSignature } from '../shared/generic-adapter.js';
export const verifyPagBankSignature = verifyGenericPaymentSignature;
export const normalizePagBankPayment = (payload: unknown, restaurantId: string) =>
  normalizeGenericPaymentPayload({ payload, restaurantId, provider: 'pagbank' });
