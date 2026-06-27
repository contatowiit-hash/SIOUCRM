import { z } from 'zod';

const normalizePhone = (value: string) => {
  const hasPlus = value.trim().startsWith('+');
  const digits = value.replace(/\D/g, '').slice(0, 15);
  return `${hasPlus ? '+' : ''}${digits}`;
};

const PhoneSchema = z.string().transform(normalizePhone).pipe(z.string().regex(/^\+?[1-9]\d{7,14}$/));
const MAX_ORDER_ITEM_PRICE = 300_000;
const MAX_ORDER_TOTAL = 1_000_000;

export const RegisterSchema = z
  .object({
    fullName: z.string().min(2).max(100),
    restaurantName: z.string().min(2).max(120),
    email: z.string().email().max(255).toLowerCase(),
    password: z
      .string()
      .min(10)
      .max(128)
      .regex(/[A-Z]/)
      .regex(/[a-z]/)
      .regex(/[0-9]/),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas precisam ser iguais.',
    path: ['confirmPassword'],
  });

export const LoginSchema = z.object({
  email: z.string().email().max(255).toLowerCase(),
  password: z.string().min(8).max(128),
});

export const ResendVerificationSchema = z.object({
  email: z.string().email().max(255).toLowerCase(),
});

export const VerifyEmailTokenSchema = z.object({
  token: z.string().min(20).max(200),
});

export const CreateCustomerSchema = z.object({
  name: z.string().min(2).max(100).regex(/^[a-zA-ZÀ-ÿ\s'-]+$/),
  phone: PhoneSchema,
  email: z.string().email().max(255).toLowerCase().optional().nullable(),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  gender: z.string().max(40).optional().nullable(),
  tags: z.array(z.string().min(1).max(30)).max(10).default([]),
  preferences: z.string().max(1000).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  status: z.enum(['active', 'inactive', 'vip', 'new']).default('new'),
  origin: z.enum(['whatsapp', 'instagram', 'referral', 'delivery', 'in_person']).default('whatsapp'),
});

export const CreateReservationSchema = z.object({
  customer_id: z.string().uuid().optional().nullable(),
  customer_name: z.string().min(2).max(100),
  phone: PhoneSchema,
  reservation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reservation_time: z.string().regex(/^\d{2}:\d{2}$/),
  party_size: z.number().int().min(1).max(80),
  table_label: z.string().max(30).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const CreateOrderSchema = z
  .object({
    customer_id: z.string().uuid().optional().nullable(),
    customer_name: z.string().min(2).max(100),
    channel: z.enum(['dining_room', 'delivery', 'whatsapp', 'ifood', 'phone']),
    status: z.enum(['received', 'preparing', 'delivered', 'cancelled']).default('received'),
    payment_method: z.string().min(2).max(60),
    notes: z.string().max(1000).optional().nullable(),
    items: z
      .array(
        z.object({
          name: z.string().min(1).max(120),
          quantity: z
            .number({ invalid_type_error: 'Quantidade inválida.' })
            .int('Use uma quantidade inteira.')
            .min(1, 'A quantidade precisa ser maior que zero.')
            .max(999, 'Quantidade máxima por item: 999.'),
          price: z
            .number({ invalid_type_error: 'Preço inválido.' })
            .finite('Informe um preço válido.')
            .min(0, 'O preço não pode ser negativo.')
            .max(MAX_ORDER_ITEM_PRICE, 'Preço máximo por item: R$ 300.000,00.'),
          category: z.string().min(1).max(80),
        }),
      )
      .min(1)
      .max(80),
  })
  .superRefine((order, ctx) => {
    const total = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    if (total > MAX_ORDER_TOTAL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items'],
        message: 'Valor total do pedido alto demais. Revise preço e quantidade.',
      });
    }
  });

export const CreateCampaignSchema = z.object({
  name: z.string().min(2).max(120),
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
  audience: z.string().min(2).max(160),
  message: z.string().min(4).max(4096),
  channel: z.enum(['whatsapp', 'email', 'sms']).default('whatsapp'),
  scheduled_at: z.string().datetime().optional().nullable(),
});

export const WhatsAppSendSchema = z.object({
  customer_id: z.string().uuid().optional().nullable(),
  phone: PhoneSchema,
  message: z.string().min(1).max(4096),
});

export const UpdateReservationStatusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed', 'no_show']),
});

const AutomationBaseSchema = z.object({
  name: z.string().min(2).max(120),
  trigger_type: z.string().min(2).max(120),
  audience: z.string().max(160).optional().nullable(),
  action: z.string().max(220).optional().nullable(),
  channel: z.string().min(2).max(60).default('WhatsApp'),
  impact: z.string().max(160).optional().nullable(),
  message: z.string().max(4096).optional().nullable(),
  status: z.enum(['active', 'paused']).default('active'),
});

export const CreateAutomationSchema = AutomationBaseSchema;

export const UpdateAutomationSchema = AutomationBaseSchema.partial().refine((data) => Object.keys(data).length > 0, {
  message: 'Informe ao menos um campo.',
});

export const UpdateAutomationStatusSchema = z.object({
  status: z.enum(['active', 'paused']),
});

const TimeSchema = z.string().regex(/^\d{2}:\d{2}$/);
const TextListSchema = z.array(z.string().min(1).max(60)).max(30);

export const AiSettingsSchema = z.object({
  ai_name: z.string().min(1).max(60).optional(),
  avatar_url: z.string().max(200_000).optional().nullable(),
  ai_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  voice_tone: z.enum(['formal', 'casual', 'animado']).optional(),
  behavior_instructions: z.string().max(5000).optional(),
  menu_text: z.string().max(30000).optional(),
  menu_pdf_name: z.string().max(255).optional(),
  menu_pdf_data: z.string().max(8_100_000).optional().nullable(),
  greeting_message: z.string().min(1).max(1000).optional(),
  after_hours_message: z.string().min(1).max(1000).optional(),
  active_start_time: TimeSchema.optional(),
  active_end_time: TimeSchema.optional(),
  normal_delivery_time: z.string().min(1).max(80).optional(),
  peak_days: TextListSchema.optional(),
  peak_start_time: TimeSchema.optional(),
  peak_end_time: TimeSchema.optional(),
  peak_delivery_time: z.string().min(1).max(80).optional(),
  confirm_address: z.boolean().optional(),
  ask_payment_method: z.boolean().optional(),
  accepted_payment_methods: z.array(z.enum(['pix', 'cartao', 'dinheiro'])).max(3).optional(),
  delivery_fee: z.string().max(160).optional(),
  served_neighborhoods: z.string().max(2000).optional(),
  minimum_order: z.number().finite().min(0).max(100000).optional(),
  local_pickup: z.boolean().optional(),
  auto_offer_addons: z.boolean().optional(),
  upsell_categories: z.array(z.enum(['bebidas', 'sobremesas', 'bordas', 'porcoes_extras'])).max(4).optional(),
  offer_combos: z.boolean().optional(),
  upsell_phrase: z.string().max(240).optional(),
  active_coupon: z.string().max(80).optional(),
  recover_inactive_customer: z.boolean().optional(),
  post_sale_message: z.string().max(1000).optional(),
  do_not_invent_products: z.boolean().optional(),
  do_not_discount_without_permission: z.boolean().optional(),
  do_not_promise_impossible_delivery: z.boolean().optional(),
  do_not_reply_outside_restaurant: z.boolean().optional(),
  max_discount_percent: z.number().int().min(0).max(100).optional(),
  forbidden_words: TextListSchema.optional(),
  whatsapp_status: z.enum(['connected', 'disconnected']).optional(),
  auto_replies_enabled: z.boolean().optional(),
  temporarily_paused: z.boolean().optional(),
  transfer_to_human: z.boolean().optional(),
});
