import { normalizeGenericPdvPayload } from '../shared/normalize.js';
export const normalizeConsumerPayload = (payload: unknown, restaurantId: string) =>
  normalizeGenericPdvPayload({ payload, restaurantId, provider: 'consumer' });
