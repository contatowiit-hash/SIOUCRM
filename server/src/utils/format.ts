import type { InferSelectModel } from 'drizzle-orm';
import type { automations, campaigns, customers, orderItems, orders, reservations, restaurants, users } from '../db/schema.js';
import { isDeveloperEmail } from './developer.js';

const toIsoString = (value: Date | string | null | undefined) => {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

export const toRestaurantDto = (row: InferSelectModel<typeof restaurants>, options: { developer?: boolean } = {}) => ({
  id: row.id,
  name: row.name,
  plan: options.developer ? 'lifetime' : row.plan,
  status: options.developer ? 'active' : row.status,
});

export const toUserDto = (row: InferSelectModel<typeof users>) => ({
  id: row.id,
  email: row.email,
  full_name: row.fullName,
  role: row.role,
  restaurant_id: row.restaurantId,
  email_verified_at: toIsoString(row.emailVerifiedAt),
  is_dev: isDeveloperEmail(row.email),
});

export const toCustomerDto = (row: InferSelectModel<typeof customers>) => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  avatar_url: row.avatarUrl,
  email: row.email,
  birth_date: row.birthDate,
  gender: row.gender,
  tags: row.tags,
  preferences: row.preferences,
  notes: row.notes,
  last_visit: row.lastVisit,
  total_spent: Number(row.totalSpent),
  orders_count: row.ordersCount,
  loyalty_score: row.loyaltyScore,
  status: row.status,
  origin: row.origin,
  created_at: toIsoString(row.createdAt) ?? new Date().toISOString(),
});

export const toBasicCustomerDto = (row: InferSelectModel<typeof customers>) => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  avatar_url: row.avatarUrl,
  tags: row.tags,
  last_visit: row.lastVisit,
  orders_count: row.ordersCount,
  status: row.status,
  origin: row.origin,
  created_at: toIsoString(row.createdAt) ?? new Date().toISOString(),
});

export const toReservationDto = (row: InferSelectModel<typeof reservations>) => ({
  id: row.id,
  customer_id: row.customerId,
  customer_name: row.customerName,
  phone: row.phone,
  reservation_date: row.reservationDate,
  reservation_time: row.reservationTime,
  party_size: row.partySize,
  table_label: row.tableLabel,
  status: row.status,
  notes: row.notes,
});

export const toOrderDto = (
  row: InferSelectModel<typeof orders>,
  items: Array<InferSelectModel<typeof orderItems>> = [],
) => ({
  id: row.id,
  customer_id: row.customerId,
  customer_name: row.customerName,
  items: items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    price: Number(item.price),
    category: item.category,
  })),
  total_amount: Number(row.totalAmount),
  order_date: toIsoString(row.orderDate) ?? new Date().toISOString(),
  channel: row.channel,
  status: row.status,
  payment_method: row.paymentMethod,
  payment_status: row.paymentStatus,
  pix_charge_id: row.pixChargeId,
  notes: row.notes,
});

export const toCampaignDto = (row: InferSelectModel<typeof campaigns>) => ({
  id: row.id,
  name: row.name,
  type: row.type,
  audience: row.audience,
  message: row.message,
  channel: row.channel as 'whatsapp' | 'email' | 'sms',
  scheduled_at: toIsoString(row.scheduledAt),
  status: row.status,
  sent_count: row.sentCount,
  delivered_count: row.deliveredCount,
  replied_count: row.repliedCount,
  converted_count: row.convertedCount,
  estimated_revenue: Number(row.estimatedRevenue),
});

export const toAutomationDto = (row: InferSelectModel<typeof automations>) => {
  const config = (row.config || {}) as {
    channel?: string;
    impact?: string;
    audience?: string;
    action?: string;
    message?: string;
  };
  return {
    id: row.id,
    title: row.name,
    trigger: row.triggerType,
    audience: config.audience || null,
    action: config.action || null,
    channel: config.channel || 'WhatsApp',
    status: row.status,
    impact: config.impact || 'Aguardando dados reais',
    message: config.message || null,
  };
};
