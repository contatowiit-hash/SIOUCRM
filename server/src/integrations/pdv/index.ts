import { normalizeAnotaAiPayload } from './anotaai/adapter.js';
import { normalizeConsumerPayload } from './consumer/adapter.js';
import { normalizeGoomerPayload } from './goomer/adapter.js';
import { normalizeSaiposPayload } from './saipos/adapter.js';
import { normalizeSischefPayload } from './sischef/adapter.js';

export const pdvProviders = ['saipos', 'goomer', 'anotaai', 'sischef', 'consumer'] as const;
export type PdvProvider = (typeof pdvProviders)[number];

export const pdvAdapters: Record<PdvProvider, (payload: unknown, restaurantId: string) => ReturnType<typeof normalizeSaiposPayload>> = {
  saipos: normalizeSaiposPayload,
  goomer: normalizeGoomerPayload,
  anotaai: normalizeAnotaAiPayload,
  sischef: normalizeSischefPayload,
  consumer: normalizeConsumerPayload,
};
