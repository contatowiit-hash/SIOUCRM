import { normalizeGenericPdvPayload } from '../shared/normalize.js';
export const normalizeSischefPayload = (payload: unknown, restaurantId: string) =>
  normalizeGenericPdvPayload({ payload, restaurantId, provider: 'sischef' });
