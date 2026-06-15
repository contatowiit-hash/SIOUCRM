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
  if (method.includes('card') || method.includes('cart')) return 'card';
  if (method.includes('cash') || method.includes('dinheiro')) return 'cash';
  return 'unknown';
};

const normalizeStatus = (value: unknown): PaymentStatus => {
  const status = asString(value)?.toLowerCase() ?? '';
  if (['paid', 'approved', 'pago', 'concluido', 'completed'].some((item) => status.includes(item))) return 'paid';
  if (['failed', 'rejected', 'cancelled', 'canceled', 'falhou'].some((item) => status.includes(item))) return 'failed';
  if (['pending', 'waiting', 'pendente'].some((item) => status.includes(item))) return 'pending';
  return 'unknown';
};

export const normalizeGenericPdvPayload = ({
  payload,
  provider,
  restaurantId,
}: {
  payload: unknown;
  provider: string;
  restaurantId: string;
}): NormalizedTransaction => {
  const record = recordSchema.parse(payload);
  const sale = record.order && typeof record.order === 'object' ? recordSchema.parse(record.order) : record;
  const externalSaleId = asString(first(sale, ['external_sale_id', 'externalSaleId', 'order_id', 'orderId', 'id', 'code']));
  const totalAmount = asNumber(first(sale, ['total_amount', 'totalAmount', 'total', 'amount', 'value']));
  if (!externalSaleId || totalAmount === null) throw new Error('Provider payload is missing sale id or total');

  const rawItems = first(sale, ['items', 'products', 'itens']);
  const items = Array.isArray(rawItems)
    ? rawItems
        .map((item) => itemSchema.safeParse(item))
        .filter((item): item is z.SafeParseSuccess<z.infer<typeof itemSchema>> => item.success)
        .map((item) => item.data)
    : undefined;

  const createdAtValue = asString(first(sale, ['created_at', 'createdAt', 'date', 'timestamp']));
  const createdAt = createdAtValue && !Number.isNaN(Date.parse(createdAtValue)) ? new Date(createdAtValue).toISOString() : new Date().toISOString();

  return {
    externalSaleId,
    restaurantId,
    totalAmount,
    source: provider,
    paymentMethod: normalizeMethod(first(sale, ['payment_method', 'paymentMethod', 'method'])),
    paymentStatus: normalizeStatus(first(sale, ['payment_status', 'paymentStatus', 'status'])),
    items: items?.length ? items : undefined,
    createdAt,
  };
};
