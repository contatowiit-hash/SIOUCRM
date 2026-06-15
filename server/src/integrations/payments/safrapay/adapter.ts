import { normalizeGenericPaymentPayload, verifyGenericPaymentSignature } from '../shared/generic-adapter.js';
export const verifySafraPaySignature = verifyGenericPaymentSignature;
export const normalizeSafraPayPayment = (payload: unknown, restaurantId: string) =>
  normalizeGenericPaymentPayload({ payload, restaurantId, provider: 'safrapay' });
