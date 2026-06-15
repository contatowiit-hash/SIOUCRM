import { normalizeGenericPdvPayload } from '../shared/normalize.js';
export const normalizeGoomerPayload = (payload: unknown, restaurantId: string) =>
  normalizeGenericPdvPayload({ payload, restaurantId, provider: 'goomer' });
