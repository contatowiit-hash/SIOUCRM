import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { NormalizedTransaction } from '../../shared/types.js';

const webhookSchema = z.object({
  id: z.string().optional(),
  reference_id: z.string().uuid(),
  created_at: z.string().optional(),
  charges: z
    .array(
      z.object({
        id: z.string(),
        status: z.string(),
        amount: z.object({ value: z.coerce.number().nonnegative() }),
        payment_method: z.object({ type: z.string().optional() }).optional(),
        paid_at: z.string().optional(),
      }),
    )
    .optional(),
});

export const verifyPagBankAuthenticity = (rawBody: string, authenticity: string | undefined, accessToken: string) => {
  if (!authenticity) return false;
  const expected = Buffer.from(createHash('sha256').update(`${accessToken}-${rawBody}`).digest('hex'), 'utf8');
  const received = Buffer.from(authenticity.trim().toLowerCase(), 'utf8');
  return expected.length === received.length && timingSafeEqual(expected, received);
};

export const normalizeOfficialPagBankPayment = (payload: unknown, restaurantId: string): NormalizedTransaction => {
  const parsed = webhookSchema.parse(payload);
  const charge = parsed.charges?.[0];
  const status = charge?.status?.toLowerCase() ?? 'waiting';
  return {
    externalSaleId: charge?.id ?? parsed.id ?? parsed.reference_id,
    orderId: parsed.reference_id,
    restaurantId,
    totalAmount: Number(charge?.amount.value ?? 0) / 100,
    source: 'pagbank',
    paymentMethod: charge?.payment_method?.type?.toLowerCase().includes('pix') ? 'pix' : 'unknown',
    paymentStatus: ['paid', 'authorized'].includes(status) ? 'paid' : ['declined', 'canceled', 'cancelled'].includes(status) ? 'failed' : 'pending',
    pixChargeId: charge?.id ?? null,
    createdAt: charge?.paid_at ?? parsed.created_at ?? new Date().toISOString(),
  };
};
