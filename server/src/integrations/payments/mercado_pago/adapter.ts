import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NormalizedTransaction, PaymentMethod, PaymentStatus } from '../../shared/types.js';

const getString = (record: Record<string, unknown>, key: string) => {
  const value = record[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
};

const safeCompareHex = (leftHex: string, rightHex: string) => {
  try {
    const left = Buffer.from(leftHex, 'hex');
    const right = Buffer.from(rightHex, 'hex');
    return left.length === right.length && timingSafeEqual(left, right);
  } catch {
    return false;
  }
};

export const verifyMercadoPagoSignature = ({
  dataId,
  requestId,
  signature,
  secret,
}: {
  dataId: string;
  requestId: string | undefined;
  signature: string | undefined;
  secret: string | undefined;
}) => {
  if (!dataId || !requestId || !signature || !secret) return false;
  const parts = Object.fromEntries(
    signature.split(',').map((part) => {
      const [key, ...value] = part.trim().split('=');
      return [key, value.join('=')];
    }),
  );
  if (!parts.ts || !parts.v1) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');
  return safeCompareHex(expected, parts.v1);
};

const normalizeStatus = (status: string | null): PaymentStatus => {
  if (status === 'approved') return 'paid';
  if (status === 'rejected' || status === 'cancelled' || status === 'refunded' || status === 'charged_back') return 'failed';
  if (status === 'pending' || status === 'in_process' || status === 'authorized') return 'pending';
  return 'unknown';
};

const normalizeMethod = (payment: Record<string, unknown>): PaymentMethod => {
  const method = `${getString(payment, 'payment_method_id') ?? ''} ${getString(payment, 'payment_type_id') ?? ''}`.toLowerCase();
  if (method.includes('pix')) return 'pix';
  if (method.includes('card')) return 'card';
  if (method.includes('cash') || method.includes('ticket')) return 'cash';
  return 'unknown';
};

export const normalizeMercadoPagoPayment = (
  payment: Record<string, unknown>,
  restaurantId: string,
): NormalizedTransaction => {
  const id = getString(payment, 'id');
  const amount = Number(payment.transaction_amount);
  if (!id || !Number.isFinite(amount) || amount < 0) throw new Error('Mercado Pago payment is missing id or amount');
  const possibleOrderId = getString(payment, 'external_reference');
  const orderId = possibleOrderId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(possibleOrderId)
    ? possibleOrderId
    : null;
  const createdAtValue = getString(payment, 'date_created');
  return {
    externalSaleId: id,
    restaurantId,
    orderId,
    totalAmount: amount,
    source: 'mercado_pago',
    paymentMethod: normalizeMethod(payment),
    paymentStatus: normalizeStatus(getString(payment, 'status')),
    pixChargeId: normalizeMethod(payment) === 'pix' ? id : null,
    createdAt: createdAtValue && !Number.isNaN(Date.parse(createdAtValue)) ? new Date(createdAtValue).toISOString() : new Date().toISOString(),
  };
};
