import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { NormalizedTransaction, PaymentMethod, PaymentStatus } from '../../shared/types.js';

const recordSchema = z.record(z.unknown());
const itemSchema = z.object({
  name: z.string().min(1).max(160),
  quantity: z.coerce.number().int().positive().max(999).default(1),
  price: z.coerce.number().nonnegative().max(1_000_000),
});

const first = (record: Record<string, unknown>, keys: string[]) => keys.map((key) => record[key]).find((value) => value != null);
const asString = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value) : null);
const asNumber = (value: unknown) => {
  const parsed = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const normalizeMethod = (value: unknown): PaymentMethod => {
  const method = asString(value)?.toLowerCase() ?? '';
  if (method.includes('pix')) return 'pix';
  if (method.includes('card') || method.includes('cart') || method.includes('credit') || method.includes('debit')) return 'card';
  if (method.includes('cash') || method.includes('dinheiro')) return 'cash';
  return 'unknown';
};

const normalizeStatus = (value: unknown): PaymentStatus => {
  const status = asString(value)?.toLowerCase() ?? '';
  if (['paid', 'approved', 'pago', 'captured', 'completed'].some((item) => status.includes(item))) return 'paid';
  if (['failed', 'rejected', 'cancelled', 'canceled', 'denied', 'refunded'].some((item) => status.includes(item))) return 'failed';
  if (['pending', 'waiting', 'authorized', 'processing'].some((item) => status.includes(item))) return 'pending';
  return 'unknown';
};

const safeCompareHex = (leftHex: string, rightHex: string) => {
  try {
    const left = Buffer.from(leftHex, 'hex');
    const right = Buffer.from(rightHex.replace(/^sha256=/i, ''), 'hex');
    return left.length === right.length && timingSafeEqual(left, right);
  } catch {
    return false;
  }
};

export const verifyGenericPaymentSignature = (rawBody: string, signature: string | undefined, secret: string | undefined) => {
  if (!signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeCompareHex(expected, signature);
};

export const getGenericPaymentIdentity = (payload: unknown) => {
  const record = recordSchema.parse(payload);
  const payment = record.payment && typeof record.payment === 'object' ? recordSchema.parse(record.payment) : record;
  return {
    externalAccountId: asString(first(payment, ['external_account_id', 'externalAccountId', 'merchant_id', 'merchantId', 'seller_id', 'sellerId'])),
    providerEventId: asString(first(record, ['event_id', 'eventId', 'notification_id', 'notificationId'])),
    eventType: asString(first(record, ['event_type', 'eventType', 'type'])),
  };
};

export const normalizeGenericPaymentPayload = ({
  payload,
  provider,
  restaurantId,
}: {
  payload: unknown;
  provider: string;
  restaurantId: string;
}): NormalizedTransaction => {
  const record = recordSchema.parse(payload);
  const payment = record.payment && typeof record.payment === 'object' ? recordSchema.parse(record.payment) : record;
  const externalSaleId = asString(first(payment, ['external_sale_id', 'externalSaleId', 'transaction_id', 'transactionId', 'payment_id', 'paymentId', 'id']));
  const totalAmount = asNumber(first(payment, ['total_amount', 'totalAmount', 'transaction_amount', 'transactionAmount', 'amount', 'value']));
  if (!externalSaleId || totalAmount === null) throw new Error('Provider payload is missing transaction id or amount');

  const rawItems = first(payment, ['items', 'products', 'itens']);
  const items = Array.isArray(rawItems)
    ? rawItems
        .map((item) => itemSchema.safeParse(item))
        .filter((item): item is z.SafeParseSuccess<z.infer<typeof itemSchema>> => item.success)
        .map((item) => item.data)
    : undefined;
  const createdAtValue = asString(first(payment, ['created_at', 'createdAt', 'date', 'timestamp']));

  return {
    externalSaleId,
    restaurantId,
    totalAmount,
    source: provider,
    paymentMethod: normalizeMethod(first(payment, ['payment_method', 'paymentMethod', 'method', 'payment_type'])),
    paymentStatus: normalizeStatus(first(payment, ['payment_status', 'paymentStatus', 'status'])),
    items: items?.length ? items : undefined,
    createdAt: createdAtValue && !Number.isNaN(Date.parse(createdAtValue)) ? new Date(createdAtValue).toISOString() : new Date().toISOString(),
  };
};
