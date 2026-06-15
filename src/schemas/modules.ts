import { z } from 'zod';
import { isValidPhone } from '../lib/security';

const MAX_ORDER_ITEM_PRICE = 300_000;

export const ReservationSchema = z.object({
  customer_name: z.string().min(2, 'Informe o nome.').max(100),
  phone: z.string().refine(isValidPhone, 'Telefone inválido.'),
  reservation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data invalida.'),
  reservation_time: z.string().regex(/^\d{2}:\d{2}$/, 'Horario invalido.'),
  party_size: z.coerce.number().int().min(1).max(80),
  table_label: z.string().max(30).optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

export const OrderSchema = z.object({
  customer_name: z.string().min(2, 'Informe o cliente.').max(100),
  channel: z.enum(['dining_room', 'delivery', 'whatsapp', 'ifood', 'phone']),
  status: z.enum(['received', 'preparing', 'delivered', 'cancelled']).default('received'),
  payment_method: z.string().min(2, 'Informe o pagamento.').max(60),
  notes: z.string().max(1000).optional().or(z.literal('')),
  item_name: z.string().min(1, 'Informe o item.').max(120),
  item_category: z.string().min(1, 'Informe a categoria.').max(80),
  item_quantity: z.coerce.number().int('Use uma quantidade inteira.').min(1, 'A quantidade precisa ser maior que zero.').max(999, 'Quantidade máxima por item: 999.'),
  item_price: z.coerce
    .number()
    .min(0, 'O preço não pode ser negativo.')
    .max(MAX_ORDER_ITEM_PRICE, 'Preço máximo por item: R$ 300.000,00.')
    .refine(Number.isFinite, 'Informe um preço válido.'),
});

export const CampaignSchema = z.object({
  name: z.string().min(2, 'Informe o nome.').max(120),
  type: z.enum([
    'birthday',
    'inactive_customer',
    'promotion',
    'weekend',
    'coupon',
    'special_event',
    'post_sale',
    'winback',
  ]),
  audience: z.string().min(2, 'Informe o público.').max(160),
  message: z.string().min(4, 'Mensagem muito curta.').max(4096),
  channel: z.enum(['whatsapp', 'email', 'sms']),
  scheduled_at: z.string().optional().or(z.literal('')),
});

export const WhatsAppMessageSchema = z.object({
  customer_id: z.string().optional().nullable(),
  phone: z.string().refine(isValidPhone, 'Telefone inválido.'),
  message: z.string().min(1, 'Digite uma mensagem.').max(4096),
});

export const AutomationSchema = z.object({
  name: z.string().min(2, 'Informe o nome.').max(120),
  trigger_type: z.string().min(2, 'Informe o gatilho.').max(120),
  audience: z.string().min(2, 'Informe o público.').max(160),
  action: z.string().min(2, 'Informe a ação.').max(220),
  channel: z.string().min(2).max(60).default('WhatsApp'),
  impact: z.string().max(160).optional().or(z.literal('')),
  message: z.string().max(4096).optional().or(z.literal('')),
  status: z.enum(['active', 'paused']).default('active'),
});

export type ReservationInput = z.infer<typeof ReservationSchema>;
export type OrderInput = z.infer<typeof OrderSchema>;
export type CampaignInput = z.infer<typeof CampaignSchema>;
export type AutomationInput = z.infer<typeof AutomationSchema>;
