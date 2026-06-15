import { normalizeGenericPaymentPayload, verifyGenericPaymentSignature } from '../shared/generic-adapter.js';
export const verifyCieloSignature = verifyGenericPaymentSignature;
export const normalizeCieloPayment = (payload: unknown, restaurantId: string) =>
  normalizeGenericPaymentPayload({ payload, restaurantId, provider: 'cielo' });
