import { normalizeGenericPaymentPayload, verifyGenericPaymentSignature } from '../shared/generic-adapter.js';
export const verifyInfinitePaySignature = verifyGenericPaymentSignature;
export const normalizeInfinitePayPayment = (payload: unknown, restaurantId: string) =>
  normalizeGenericPaymentPayload({ payload, restaurantId, provider: 'infinitepay' });
