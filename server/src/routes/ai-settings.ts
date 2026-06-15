import type { FastifyInstance } from 'fastify';
import type { InferSelectModel } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { PLAN_HIERARCHY } from '../config/stripe-plans.js';
import { db } from '../db/client.js';
import { aiSettings, restaurants, subscriptions } from '../db/schema.js';
import { AiSettingsSchema } from '../schemas.js';
import { requireRoles } from '../plugins/auth.js';
import { isDeveloperEmail } from '../utils/developer.js';
import { extractMenuFromPdfDataUrl, MenuPdfError, sanitizeMenuText } from '../utils/menuPdf.js';
import { sanitizeText } from '../utils/security.js';
import { writeAuditLog } from '../utils/audit.js';

type AiSettingsRow = InferSelectModel<typeof aiSettings>;

const premiumFields = new Set([
  'auto_offer_addons',
  'upsell_categories',
  'offer_combos',
  'upsell_phrase',
  'active_coupon',
  'recover_inactive_customer',
  'post_sale_message',
  'do_not_invent_products',
  'do_not_discount_without_permission',
  'do_not_promise_impossible_delivery',
  'do_not_reply_outside_restaurant',
  'max_discount_percent',
  'forbidden_words',
]);

const planLevel = (plan: string) => PLAN_HIERARCHY[plan] ?? PLAN_HIERARCHY.free;
const hasPremiumAccess = (plan: string) => planLevel(plan) >= planLevel('premium');

const getCurrentPlan = async (restaurantId: string, email: string) => {
  if (isDeveloperEmail(email)) return 'founder_lifetime';

  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.restaurantId, restaurantId))
    .limit(1);

  if (subscription?.status === 'active') return subscription.plan;

  const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
  return restaurant?.plan ?? 'free';
};

const toDto = (row: AiSettingsRow | undefined, plan: string) => {
  const base = row ?? ({} as Partial<AiSettingsRow>);
  return {
    access: hasPremiumAccess(plan) ? 'premium' : 'pro',
    plan,
    menu_pdf_processed: Boolean(base.menuText?.trim()),
    data: {
      ai_name: base.aiName ?? 'Ana',
      avatar_url: base.avatarUrl ?? null,
      ai_color: base.aiColor ?? '#00AFFF',
      voice_tone: base.voiceTone ?? 'casual',
      behavior_instructions: base.behaviorInstructions ?? 'Seja simpatica, responda sempre em portugues e ajude o cliente a fazer o pedido.',
      menu_text: base.menuText ?? '',
      menu_pdf_name: base.menuPdfName ?? '',
      menu_pdf_data: null,
      greeting_message: base.greetingMessage ?? 'Oi! Eu sou a Ana, assistente virtual do restaurante. Como posso ajudar?',
      after_hours_message: base.afterHoursMessage ?? 'Estamos fora do horario de atendimento. Assim que voltarmos, te respondemos por aqui.',
      active_start_time: base.activeStartTime ?? '09:00',
      active_end_time: base.activeEndTime ?? '22:00',
      normal_delivery_time: base.normalDeliveryTime ?? '30 a 40 min',
      peak_days: base.peakDays ?? [],
      peak_start_time: base.peakStartTime ?? '18:00',
      peak_end_time: base.peakEndTime ?? '21:00',
      peak_delivery_time: base.peakDeliveryTime ?? '50 a 70 min',
      confirm_address: base.confirmAddress ?? true,
      ask_payment_method: base.askPaymentMethod ?? true,
      accepted_payment_methods: base.acceptedPaymentMethods ?? ['pix', 'cartao', 'dinheiro'],
      delivery_fee: base.deliveryFee ?? 'R$5 ate 3km',
      served_neighborhoods: base.servedNeighborhoods ?? '',
      minimum_order: Number(base.minimumOrder ?? 0),
      local_pickup: base.localPickup ?? true,
      auto_offer_addons: base.autoOfferAddons ?? false,
      upsell_categories: base.upsellCategories ?? [],
      offer_combos: base.offerCombos ?? false,
      upsell_phrase: base.upsellPhrase ?? 'Quer adicionar borda recheada?',
      active_coupon: base.activeCoupon ?? '',
      recover_inactive_customer: base.recoverInactiveCustomer ?? false,
      post_sale_message: base.postSaleMessage ?? 'Obrigado pelo pedido! Conta pra gente se estava tudo certinho.',
      do_not_invent_products: base.doNotInventProducts ?? true,
      do_not_discount_without_permission: base.doNotDiscountWithoutPermission ?? true,
      do_not_promise_impossible_delivery: base.doNotPromiseImpossibleDelivery ?? true,
      do_not_reply_outside_restaurant: base.doNotReplyOutsideRestaurant ?? true,
      max_discount_percent: base.maxDiscountPercent ?? 0,
      forbidden_words: base.forbiddenWords ?? [],
      whatsapp_status: base.whatsappStatus ?? 'disconnected',
      auto_replies_enabled: base.autoRepliesEnabled ?? false,
      temporarily_paused: base.temporarilyPaused ?? false,
      transfer_to_human: base.transferToHuman ?? false,
    },
  };
};

const cleanTextArray = (items: string[] | undefined) => items?.map((item) => sanitizeText(item, 60)).filter(Boolean);

export const aiSettingsRoutes = async (app: FastifyInstance) => {
  app.get('/ai-settings', { preHandler: [app.authenticate, requireRoles('owner', 'admin')] }, async (request, reply) => {
    const auth = request.auth!;
    const plan = await getCurrentPlan(auth.restaurantId, auth.email);
    if (planLevel(plan) < planLevel('pro')) {
      return reply.code(403).send({ error: 'Seu plano atual nao libera este recurso.' });
    }

    const [settings] = await db.select().from(aiSettings).where(eq(aiSettings.restaurantId, auth.restaurantId)).limit(1);

    return toDto(settings, plan);
  });

  app.post('/ai-settings', { bodyLimit: 8_500_000, preHandler: [app.authenticate, requireRoles('owner', 'admin')] }, async (request, reply) => {
    const parsed = AiSettingsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Dados invalidos' });

    const auth = request.auth!;
    const plan = await getCurrentPlan(auth.restaurantId, auth.email);
    if (planLevel(plan) < planLevel('pro')) {
      return reply.code(403).send({ error: 'Seu plano atual nao libera este recurso.' });
    }

    const input = { ...parsed.data };
    const [existingSettings] = await db
      .select()
      .from(aiSettings)
      .where(eq(aiSettings.restaurantId, auth.restaurantId))
      .limit(1);

    if (!hasPremiumAccess(plan)) {
      for (const field of premiumFields) delete (input as Record<string, unknown>)[field];
    }

    let processedMenu:
      | {
          text: string;
          categories: string[];
          productCount: number;
        }
      | undefined;

    if (typeof input.menu_pdf_data === 'string' && input.menu_pdf_data) {
      try {
        processedMenu = await extractMenuFromPdfDataUrl(input.menu_pdf_data);
      } catch (error) {
        if (error instanceof MenuPdfError) {
          return reply.code(422).send({ error: error.message, code: error.code });
        }
        throw error;
      }
    }

    if (
      input.menu_pdf_name?.trim() &&
      !processedMenu &&
      !input.menu_text?.trim() &&
      !existingSettings?.menuText.trim()
    ) {
      return reply.code(422).send({
        error: 'O arquivo aparece selecionado, mas o cardápio ainda não foi lido. Envie o PDF novamente e clique em Salvar.',
        code: 'MENU_NOT_PROCESSED',
      });
    }

    const values = {
      restaurantId: auth.restaurantId,
      ...(input.ai_name !== undefined ? { aiName: sanitizeText(input.ai_name, 60) } : {}),
      ...(input.avatar_url !== undefined ? { avatarUrl: input.avatar_url || null } : {}),
      ...(input.ai_color !== undefined ? { aiColor: input.ai_color } : {}),
      ...(input.voice_tone !== undefined ? { voiceTone: input.voice_tone } : {}),
      ...(input.behavior_instructions !== undefined ? { behaviorInstructions: sanitizeText(input.behavior_instructions, 5000) } : {}),
      ...(processedMenu
        ? { menuText: processedMenu.text }
        : input.menu_text !== undefined
          ? { menuText: sanitizeMenuText(input.menu_text) }
          : {}),
      ...(input.menu_pdf_name !== undefined ? { menuPdfName: sanitizeText(input.menu_pdf_name, 255) } : {}),
      ...(typeof input.menu_pdf_data === 'string' && input.menu_pdf_data ? { menuPdfData: input.menu_pdf_data } : {}),
      ...(input.greeting_message !== undefined ? { greetingMessage: sanitizeText(input.greeting_message, 1000) } : {}),
      ...(input.after_hours_message !== undefined ? { afterHoursMessage: sanitizeText(input.after_hours_message, 1000) } : {}),
      ...(input.active_start_time !== undefined ? { activeStartTime: input.active_start_time } : {}),
      ...(input.active_end_time !== undefined ? { activeEndTime: input.active_end_time } : {}),
      ...(input.normal_delivery_time !== undefined ? { normalDeliveryTime: sanitizeText(input.normal_delivery_time, 80) } : {}),
      ...(input.peak_days !== undefined ? { peakDays: cleanTextArray(input.peak_days) ?? [] } : {}),
      ...(input.peak_start_time !== undefined ? { peakStartTime: input.peak_start_time } : {}),
      ...(input.peak_end_time !== undefined ? { peakEndTime: input.peak_end_time } : {}),
      ...(input.peak_delivery_time !== undefined ? { peakDeliveryTime: sanitizeText(input.peak_delivery_time, 80) } : {}),
      ...(input.confirm_address !== undefined ? { confirmAddress: input.confirm_address } : {}),
      ...(input.ask_payment_method !== undefined ? { askPaymentMethod: input.ask_payment_method } : {}),
      ...(input.accepted_payment_methods !== undefined ? { acceptedPaymentMethods: input.accepted_payment_methods } : {}),
      ...(input.delivery_fee !== undefined ? { deliveryFee: sanitizeText(input.delivery_fee, 160) } : {}),
      ...(input.served_neighborhoods !== undefined ? { servedNeighborhoods: sanitizeText(input.served_neighborhoods, 2000) } : {}),
      ...(input.minimum_order !== undefined ? { minimumOrder: String(input.minimum_order) } : {}),
      ...(input.local_pickup !== undefined ? { localPickup: input.local_pickup } : {}),
      ...(input.auto_offer_addons !== undefined ? { autoOfferAddons: input.auto_offer_addons } : {}),
      ...(input.upsell_categories !== undefined ? { upsellCategories: input.upsell_categories } : {}),
      ...(input.offer_combos !== undefined ? { offerCombos: input.offer_combos } : {}),
      ...(input.upsell_phrase !== undefined ? { upsellPhrase: sanitizeText(input.upsell_phrase, 240) } : {}),
      ...(input.active_coupon !== undefined ? { activeCoupon: sanitizeText(input.active_coupon, 80) } : {}),
      ...(input.recover_inactive_customer !== undefined ? { recoverInactiveCustomer: input.recover_inactive_customer } : {}),
      ...(input.post_sale_message !== undefined ? { postSaleMessage: sanitizeText(input.post_sale_message, 1000) } : {}),
      ...(input.do_not_invent_products !== undefined ? { doNotInventProducts: input.do_not_invent_products } : {}),
      ...(input.do_not_discount_without_permission !== undefined ? { doNotDiscountWithoutPermission: input.do_not_discount_without_permission } : {}),
      ...(input.do_not_promise_impossible_delivery !== undefined ? { doNotPromiseImpossibleDelivery: input.do_not_promise_impossible_delivery } : {}),
      ...(input.do_not_reply_outside_restaurant !== undefined ? { doNotReplyOutsideRestaurant: input.do_not_reply_outside_restaurant } : {}),
      ...(input.max_discount_percent !== undefined ? { maxDiscountPercent: input.max_discount_percent } : {}),
      ...(input.forbidden_words !== undefined ? { forbiddenWords: cleanTextArray(input.forbidden_words) ?? [] } : {}),
      ...(input.whatsapp_status !== undefined ? { whatsappStatus: input.whatsapp_status } : {}),
      ...(input.auto_replies_enabled !== undefined ? { autoRepliesEnabled: input.auto_replies_enabled } : {}),
      ...(input.temporarily_paused !== undefined ? { temporarilyPaused: input.temporarily_paused } : {}),
      ...(input.transfer_to_human !== undefined ? { transferToHuman: input.transfer_to_human } : {}),
      updatedAt: new Date(),
    };

    const [saved] = await db
      .insert(aiSettings)
      .values(values)
      .onConflictDoUpdate({
        target: aiSettings.restaurantId,
        set: values,
      })
      .returning();

    writeAuditLog({
      request,
      restaurantId: auth.restaurantId,
      userId: auth.userId,
      action: 'ai_settings_saved',
      resourceType: 'ai_settings',
      resourceId: saved.id,
      newData: {
        access: hasPremiumAccess(plan) ? 'premium' : 'pro',
        menu_pdf_processed: Boolean(processedMenu),
        menu_products_found: processedMenu?.productCount ?? null,
        menu_categories_found: processedMenu?.categories.length ?? null,
      },
    }).catch((error) => request.log.error({ error }, 'ai settings audit log failed'));

    return {
      ...toDto(saved, plan),
      saved: true,
      menu_pdf_processed: Boolean(saved.menuText.trim()),
      menu_pdf_product_count: processedMenu?.productCount ?? 0,
      menu_pdf_categories: processedMenu?.categories ?? [],
    };
  });
};
