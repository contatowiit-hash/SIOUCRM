import { z } from 'zod';
import type { NormalizedTransaction, PaymentMethod, PaymentStatus } from '../../shared/types.js';

const moneySchema = z
  .object({
    value: z.coerce.number().nonnegative(),
    currency: z.string().optional(),
  })
  .passthrough();

const itemSchema = z
  .object({
    name: z.string().min(1).max(160),
    quantity: z.coerce.number().positive().default(1),
    unitPrice: moneySchema.optional(),
    subtotalPrice: moneySchema.optional(),
    totalPrice: moneySchema.optional(),
  })
  .passthrough();

const paymentMethodSchema = z
  .object({
    type: z.string().optional(),
    method: z.string().optional(),
  })
  .passthrough();

const orderSchema = z
  .object({
    id: z.string().min(1),
    displayId: z.string().optional(),
    createdAt: z.string().optional(),
    status: z.string().optional(),
    totalPrice: z.coerce.number().nonnegative().optional(),
    total: z
      .object({
        orderAmount: moneySchema.optional(),
      })
      .passthrough()
      .optional(),
    payments: z
      .object({
        prepaid: z.coerce.number().nonnegative().optional(),
        pending: z.coerce.number().nonnegative().optional(),
        methods: z.array(paymentMethodSchema).optional(),
      })
      .passthrough()
      .optional(),
    items: z.array(itemSchema).optional(),
  })
  .passthrough();

const eventSchema = z
  .object({
    eventId: z.string().min(1),
    eventType: z.string().min(1),
    orderId: z.string().min(1),
    orderURL: z.string().min(1).optional(),
    createdAt: z.string().optional(),
  })
  .passthrough();

const cancelledEvents = new Set(['CANCELLED', 'ORDER_CANCELLATION_REQUEST', 'CANCELLED_DENIED']);

const parseDate = (value: string | undefined) =>
  value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : new Date().toISOString();

const normalizePaymentMethod = (method: string | undefined): PaymentMethod => {
  const value = method?.toUpperCase() ?? '';
  if (value === 'PIX') return 'pix';
  if (value === 'CASH') return 'cash';
  if (['CREDIT', 'DEBIT', 'CREDIT_DEBIT', 'MEAL_VOUCHER', 'FOOD_VOUCHER', 'DIGITAL_WALLET'].includes(value)) {
    return 'card';
  }
  return 'unknown';
};

const normalizePaymentStatus = ({
  orderStatus,
  eventType,
  prepaid,
  pending,
}: {
  orderStatus?: string;
  eventType?: string;
  prepaid?: number;
  pending?: number;
}): PaymentStatus => {
  const status = orderStatus?.toUpperCase() ?? '';
  const event = eventType?.toUpperCase() ?? '';
  if (cancelledEvents.has(event) || status.includes('CANCEL')) return 'failed';
  if ((pending ?? 0) > 0) return 'pending';
  if ((prepaid ?? 0) > 0) return 'paid';
  return 'unknown';
};

export const parseGoomerEvent = (payload: unknown) => eventSchema.parse(payload);

export const normalizeGoomerOrderPayload = (
  payload: unknown,
  restaurantId: string,
  eventType?: string,
): NormalizedTransaction => {
  const order = orderSchema.parse(payload);
  const totalAmount = order.total?.orderAmount?.value ?? order.totalPrice;
  if (totalAmount == null) throw new Error('Goomer order is missing total amount');

  const firstPaymentMethod = order.payments?.methods?.[0]?.method;
  const items = order.items
    ?.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      price: item.totalPrice?.value ?? item.subtotalPrice?.value ?? item.unitPrice?.value ?? 0,
    }))
    .filter((item) => item.price >= 0);

  return {
    externalSaleId: order.id,
    restaurantId,
    totalAmount,
    source: 'goomer',
    paymentMethod: normalizePaymentMethod(firstPaymentMethod),
    paymentStatus: normalizePaymentStatus({
      orderStatus: order.status,
      eventType,
      prepaid: order.payments?.prepaid,
      pending: order.payments?.pending,
    }),
    items: items?.length ? items : undefined,
    createdAt: parseDate(order.createdAt),
  };
};

export const normalizeGoomerPayload = (payload: unknown, restaurantId: string) =>
  normalizeGoomerOrderPayload(payload, restaurantId);
