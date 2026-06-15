export const paymentStatuses = ['pending', 'paid', 'failed', 'unknown'] as const;
export const paymentMethods = ['pix', 'card', 'cash', 'unknown'] as const;

export type PaymentStatus = (typeof paymentStatuses)[number];
export type PaymentMethod = (typeof paymentMethods)[number];

export interface NormalizedTransaction {
  externalSaleId: string;
  restaurantId: string;
  orderId?: string | null;
  totalAmount: number;
  source: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  pixChargeId?: string | null;
  items?: Array<{ name: string; quantity: number; price: number }>;
  createdAt: string;
}
