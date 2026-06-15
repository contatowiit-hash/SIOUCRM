import { normalizeGenericPdvPayload } from '../shared/normalize.js';
export const normalizeAnotaAiPayload = (payload: unknown, restaurantId: string) =>
  normalizeGenericPdvPayload({ payload, restaurantId, provider: 'anotaai' });
