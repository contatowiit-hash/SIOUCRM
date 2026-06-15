import { normalizeGenericPaymentPayload, verifyGenericPaymentSignature } from '../shared/generic-adapter.js';
export const verifyStoneSignature = verifyGenericPaymentSignature;
export const normalizeStonePayment = (payload: unknown, restaurantId: string) =>
  normalizeGenericPaymentPayload({ payload, restaurantId, provider: 'stone' });
