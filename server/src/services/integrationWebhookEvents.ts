import { db } from '../db/client.js';
import { integrationWebhookEvents } from '../db/schema.js';

export const saveRawIntegrationEvent = async ({
  restaurantId,
  paymentConnectionId,
  provider,
  eventType,
  providerEventId,
  payload,
}: {
  restaurantId: string;
  paymentConnectionId: string;
  provider: string;
  eventType: string | null;
  providerEventId: string | null;
  payload: unknown;
}) => {
  const [event] = await db
    .insert(integrationWebhookEvents)
    .values({
      restaurantId,
      paymentConnectionId,
      provider,
      eventType,
      providerEventId,
      payload,
    })
    .onConflictDoNothing()
    .returning({ id: integrationWebhookEvents.id });
  return event?.id ?? null;
};

export const finishRawIntegrationEvent = async (eventId: string | null, status: 'processed' | 'failed', error?: string) => {
  if (!eventId) return;
  await db
    .update(integrationWebhookEvents)
    .set({ status, error: error?.slice(0, 300) ?? null, processedAt: new Date() })
    .where(eq(integrationWebhookEvents.id, eventId));
};

import { eq } from 'drizzle-orm';
