import { normalizeGenericPdvPayload } from '../shared/normalize.js';
export const normalizeSaiposPayload = (payload: unknown, restaurantId: string) =>
  normalizeGenericPdvPayload({ payload, restaurantId, provider: 'saipos' });
