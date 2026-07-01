import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const roleEnum = pgEnum('role', ['owner', 'admin', 'manager', 'agent']);
export const planEnum = pgEnum('plan', ['free', 'plus', 'starter', 'pro', 'premium', 'lifetime', 'founder_lifetime']);
export const accountStatusEnum = pgEnum('account_status', ['active', 'trialing', 'past_due', 'cancelled']);
export const customerStatusEnum = pgEnum('customer_status', ['active', 'inactive', 'vip', 'new']);
export const customerOriginEnum = pgEnum('customer_origin', ['whatsapp', 'instagram', 'referral', 'delivery', 'in_person']);
export const reservationStatusEnum = pgEnum('reservation_status', [
  'pending',
  'confirmed',
  'cancelled',
  'completed',
  'no_show',
]);
export const orderStatusEnum = pgEnum('order_status', ['received', 'preparing', 'delivered', 'cancelled']);
export const orderChannelEnum = pgEnum('order_channel', ['dining_room', 'delivery', 'whatsapp', 'ifood', 'phone']);
export const campaignTypeEnum = pgEnum('campaign_type', [
  'birthday',
  'inactive_customer',
  'promotion',
  'weekend',
  'coupon',
  'special_event',
  'post_sale',
  'winback',
]);
export const campaignStatusEnum = pgEnum('campaign_status', ['draft', 'scheduled', 'sending', 'sent', 'paused']);
export const messageDirectionEnum = pgEnum('message_direction', ['inbound', 'outbound']);
export const automationStatusEnum = pgEnum('automation_status', ['active', 'paused']);
export const messageUsageTypeEnum = pgEnum('message_usage_type', ['ai', 'whatsapp']);
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'cancelled',
  'expired',
]);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  isDeleted: boolean('is_deleted').notNull().default(false),
};

export const restaurants = pgTable(
  'restaurants',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    plan: planEnum('plan').notNull().default('free'),
    status: accountStatusEnum('status').notNull().default('active'),
    stripeAiMeterItemId: text('stripe_ai_meter_item_id'),
    stripeWhatsappMeterItemId: text('stripe_whatsapp_meter_item_id'),
    settings: jsonb('settings').notNull().default({}),
    ...timestamps,
  },
  (table) => ({
    slugIdx: uniqueIndex('restaurants_slug_idx').on(table.slug),
  }),
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    fullName: text('full_name').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: roleEnum('role').notNull().default('owner'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    emailIdx: uniqueIndex('users_email_idx').on(table.email),
    restaurantIdx: index('users_restaurant_id_idx').on(table.restaurantId),
  }),
);

export const refreshSessions = pgTable(
  'refresh_sessions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('refresh_sessions_user_id_idx').on(table.userId),
    tokenIdx: uniqueIndex('refresh_sessions_token_hash_idx').on(table.tokenHash),
  }),
);

export const emailVerificationTokens = pgTable(
  'email_verification_tokens',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('email_verification_tokens_user_id_idx').on(table.userId),
    tokenHashIdx: uniqueIndex('email_verification_tokens_token_hash_idx').on(table.tokenHash),
  }),
);

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
      name: text('name').notNull(),
      phone: text('phone').notNull(),
      avatarUrl: text('avatar_url'),
      email: text('email'),
    birthDate: date('birth_date'),
    gender: text('gender'),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    preferences: text('preferences'),
    notes: text('notes'),
    lastVisit: date('last_visit'),
    totalSpent: numeric('total_spent', { precision: 12, scale: 2 }).notNull().default('0'),
    ordersCount: integer('orders_count').notNull().default(0),
    loyaltyScore: integer('loyalty_score').notNull().default(0),
    status: customerStatusEnum('status').notNull().default('new'),
    origin: customerOriginEnum('origin').notNull().default('whatsapp'),
    ...timestamps,
  },
  (table) => ({
    restaurantIdx: index('customers_restaurant_id_idx').on(table.restaurantId),
    phoneIdx: uniqueIndex('customers_restaurant_phone_idx').on(table.restaurantId, table.phone),
    emailIdx: index('customers_email_idx').on(table.email),
    birthDateIdx: index('customers_birth_date_idx').on(table.birthDate),
    statusIdx: index('customers_status_idx').on(table.restaurantId, table.status),
  }),
);

export const reservations = pgTable(
  'reservations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    customerName: text('customer_name').notNull(),
    phone: text('phone').notNull(),
    reservationDate: date('reservation_date').notNull(),
    reservationTime: text('reservation_time').notNull(),
    partySize: integer('party_size').notNull(),
    tableLabel: text('table_label'),
    status: reservationStatusEnum('status').notNull().default('pending'),
    notes: text('notes'),
    ...timestamps,
  },
  (table) => ({
    restaurantIdx: index('reservations_restaurant_id_idx').on(table.restaurantId),
    dateIdx: index('reservations_date_idx').on(table.restaurantId, table.reservationDate),
  }),
);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    customerName: text('customer_name').notNull(),
    totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    orderDate: timestamp('order_date', { withTimezone: true }).notNull().defaultNow(),
    channel: orderChannelEnum('channel').notNull(),
    status: orderStatusEnum('status').notNull().default('received'),
    paymentMethod: text('payment_method').notNull(),
    paymentStatus: text('payment_status').notNull().default('unknown'),
    pixChargeId: text('pix_charge_id'),
    notes: text('notes'),
    ...timestamps,
  },
  (table) => ({
    restaurantIdx: index('orders_restaurant_id_idx').on(table.restaurantId),
    customerIdx: index('orders_customer_id_idx').on(table.customerId),
  }),
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    quantity: integer('quantity').notNull(),
    price: numeric('price', { precision: 12, scale: 2 }).notNull(),
    category: text('category').notNull(),
    ...timestamps,
  },
  (table) => ({
    restaurantIdx: index('order_items_restaurant_id_idx').on(table.restaurantId),
    orderIdx: index('order_items_order_id_idx').on(table.orderId),
  }),
);

export const importBatches = pgTable(
  'import_batches',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    totalRows: integer('total_rows').notNull().default(0),
    validRows: integer('valid_rows').notNull().default(0),
    duplicateRows: integer('duplicate_rows').notNull().default(0),
    invalidRows: integer('invalid_rows').notNull().default(0),
    importedRows: integer('imported_rows').notNull().default(0),
    customersCreated: integer('customers_created').notNull().default(0),
    customersUpdated: integer('customers_updated').notNull().default(0),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => ({
    restaurantIdx: index('import_batches_restaurant_id_idx').on(table.restaurantId, table.createdAt),
  }),
);

export const importedOrders = pgTable(
  'imported_orders',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    importBatchId: uuid('import_batch_id').references(() => importBatches.id, { onDelete: 'cascade' }),
    rowHash: text('row_hash').notNull(),
    customerName: text('customer_name').notNull(),
    customerPhone: text('customer_phone').notNull(),
    orderedAt: timestamp('ordered_at', { withTimezone: true }).notNull(),
    product: text('product').notNull(),
    category: text('category'),
    quantity: integer('quantity').notNull(),
    unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
    totalPrice: numeric('total_price', { precision: 12, scale: 2 }).notNull(),
    paymentMethod: text('payment_method'),
    status: text('status'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    restaurantIdx: index('imported_orders_restaurant_id_idx').on(table.restaurantId, table.orderedAt),
    batchIdx: index('imported_orders_batch_id_idx').on(table.importBatchId),
    rowHashIdx: uniqueIndex('imported_orders_restaurant_row_hash_idx').on(table.restaurantId, table.rowHash),
  }),
);

export const paymentConnections = pgTable(
  'payment_connections',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    status: text('status').notNull().default('disconnected'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    externalAccountId: text('external_account_id'),
    connectedAt: timestamp('connected_at', { withTimezone: true }),
    lastEventAt: timestamp('last_event_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    restaurantProviderIdx: uniqueIndex('payment_connections_restaurant_provider_idx').on(
      table.restaurantId,
      table.provider,
    ),
    externalAccountIdx: index('payment_connections_external_account_idx').on(table.provider, table.externalAccountId),
  }),
);

export const pdvConnections = pgTable(
  'pdv_connections',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    status: text('status').notNull().default('disconnected'),
    integrationToken: text('integration_token'),
    webhookUrl: text('webhook_url'),
    connectedAt: timestamp('connected_at', { withTimezone: true }),
    lastEventAt: timestamp('last_event_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    restaurantProviderIdx: uniqueIndex('pdv_connections_restaurant_provider_idx').on(table.restaurantId, table.provider),
  }),
);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    externalSaleId: text('external_sale_id').notNull(),
    totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
    source: text('source').notNull(),
    paymentStatus: text('payment_status').notNull().default('unknown'),
    paymentMethod: text('payment_method').notNull().default('unknown'),
    pixChargeId: text('pix_charge_id'),
    items: jsonb('items'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    restaurantSaleIdx: uniqueIndex('transactions_restaurant_source_sale_idx').on(
      table.restaurantId,
      table.source,
      table.externalSaleId,
    ),
    restaurantOccurredIdx: index('transactions_restaurant_occurred_idx').on(table.restaurantId, table.occurredAt),
  }),
);

export const integrationWebhookEvents = pgTable(
  'integration_webhook_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    paymentConnectionId: uuid('payment_connection_id').references(() => paymentConnections.id, { onDelete: 'set null' }),
    provider: text('provider').notNull(),
    eventType: text('event_type'),
    providerEventId: text('provider_event_id'),
    payload: jsonb('payload').notNull(),
    status: text('status').notNull().default('received'),
    error: text('error'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => ({
    restaurantReceivedIdx: index('integration_webhook_events_restaurant_received_idx').on(
      table.restaurantId,
      table.receivedAt,
    ),
    providerEventIdx: uniqueIndex('integration_webhook_events_provider_event_idx').on(table.provider, table.providerEventId),
  }),
);

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: campaignTypeEnum('type').notNull(),
    audience: text('audience').notNull(),
    message: text('message').notNull(),
    channel: text('channel').notNull().default('whatsapp'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    status: campaignStatusEnum('status').notNull().default('draft'),
    sentCount: integer('sent_count').notNull().default(0),
    deliveredCount: integer('delivered_count').notNull().default(0),
    repliedCount: integer('replied_count').notNull().default(0),
    convertedCount: integer('converted_count').notNull().default(0),
    estimatedRevenue: numeric('estimated_revenue', { precision: 12, scale: 2 }).notNull().default('0'),
    ...timestamps,
  },
  (table) => ({
    restaurantIdx: index('campaigns_restaurant_id_idx').on(table.restaurantId),
  }),
);

export const whatsappConversations = pgTable(
  'whatsapp_conversations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    phone: text('phone').notNull(),
    status: text('status').notNull().default('open'),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => ({
    phoneIdx: uniqueIndex('whatsapp_conversations_phone_idx').on(table.restaurantId, table.phone),
    restaurantIdx: index('whatsapp_conversations_restaurant_id_idx').on(table.restaurantId),
  }),
);

export const whatsappMessages = pgTable(
  'whatsapp_messages',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').references(() => whatsappConversations.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    phone: text('phone').notNull(),
    direction: messageDirectionEnum('direction').notNull(),
    body: text('body').notNull(),
    provider: text('provider').notNull().default('manual'),
    providerMessageId: text('provider_message_id'),
    metadata: jsonb('metadata').notNull().default({}),
    ...timestamps,
  },
  (table) => ({
    restaurantIdx: index('whatsapp_messages_restaurant_id_idx').on(table.restaurantId),
    phoneIdx: index('whatsapp_messages_phone_idx').on(table.restaurantId, table.phone),
  }),
);

export const automations = pgTable(
  'automations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    triggerType: text('trigger_type').notNull(),
    config: jsonb('config').notNull().default({}),
    status: automationStatusEnum('status').notNull().default('active'),
    ...timestamps,
  },
  (table) => ({
    restaurantIdx: index('automations_restaurant_id_idx').on(table.restaurantId),
  }),
);

export const aiSettings = pgTable(
  'ai_settings',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    aiName: text('ai_name').notNull().default('Ana'),
    avatarUrl: text('avatar_url'),
    aiColor: text('ai_color').notNull().default('#00AFFF'),
    voiceTone: text('voice_tone').notNull().default('casual'),
    behaviorInstructions: text('behavior_instructions').notNull().default('Seja simpatica, responda sempre em portugues e ajude o cliente a fazer o pedido.'),
    menuText: text('menu_text').notNull().default(''),
    menuPdfName: text('menu_pdf_name').notNull().default(''),
    menuPdfData: text('menu_pdf_data'),
    greetingMessage: text('greeting_message').notNull().default('Oi! Eu sou a Ana, assistente virtual do restaurante. Como posso ajudar?'),
    afterHoursMessage: text('after_hours_message').notNull().default('Estamos fora do horario de atendimento. Assim que voltarmos, te respondemos por aqui.'),
    activeStartTime: text('active_start_time').notNull().default('09:00'),
    activeEndTime: text('active_end_time').notNull().default('22:00'),
    normalDeliveryTime: text('normal_delivery_time').notNull().default('30 a 40 min'),
    peakDays: text('peak_days')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    peakStartTime: text('peak_start_time').notNull().default('18:00'),
    peakEndTime: text('peak_end_time').notNull().default('21:00'),
    peakDeliveryTime: text('peak_delivery_time').notNull().default('50 a 70 min'),
    confirmAddress: boolean('confirm_address').notNull().default(true),
    askPaymentMethod: boolean('ask_payment_method').notNull().default(true),
    acceptedPaymentMethods: text('accepted_payment_methods')
      .array()
      .notNull()
      .default(sql`'{pix,cartao,dinheiro}'::text[]`),
    deliveryFee: text('delivery_fee').notNull().default('R$5 ate 3km'),
    servedNeighborhoods: text('served_neighborhoods').notNull().default(''),
    minimumOrder: numeric('minimum_order', { precision: 12, scale: 2 }).notNull().default('0'),
    localPickup: boolean('local_pickup').notNull().default(true),
    autoOfferAddons: boolean('auto_offer_addons').notNull().default(false),
    upsellCategories: text('upsell_categories')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    offerCombos: boolean('offer_combos').notNull().default(false),
    upsellPhrase: text('upsell_phrase').notNull().default('Quer adicionar borda recheada?'),
    activeCoupon: text('active_coupon').notNull().default(''),
    recoverInactiveCustomer: boolean('recover_inactive_customer').notNull().default(false),
    postSaleMessage: text('post_sale_message').notNull().default('Obrigado pelo pedido! Conta pra gente se estava tudo certinho.'),
    doNotInventProducts: boolean('do_not_invent_products').notNull().default(true),
    doNotDiscountWithoutPermission: boolean('do_not_discount_without_permission').notNull().default(true),
    doNotPromiseImpossibleDelivery: boolean('do_not_promise_impossible_delivery').notNull().default(true),
    doNotReplyOutsideRestaurant: boolean('do_not_reply_outside_restaurant').notNull().default(true),
    maxDiscountPercent: integer('max_discount_percent').notNull().default(0),
    forbiddenWords: text('forbidden_words')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    whatsappStatus: text('whatsapp_status').notNull().default('disconnected'),
    autoRepliesEnabled: boolean('auto_replies_enabled').notNull().default(false),
    temporarilyPaused: boolean('temporarily_paused').notNull().default(false),
    transferToHuman: boolean('transfer_to_human').notNull().default(false),
    ...timestamps,
  },
  (table) => ({
    restaurantUniqueIdx: uniqueIndex('ai_settings_restaurant_id_unique_idx').on(table.restaurantId),
  }),
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull().default('stripe'),
    providerCustomerId: text('provider_customer_id'),
    providerSubscriptionId: text('provider_subscription_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    stripePriceId: text('stripe_price_id'),
    plan: planEnum('plan').notNull().default('free'),
    status: subscriptionStatusEnum('status').notNull().default('active'),
    lifetime: boolean('lifetime').notNull().default(false),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    restaurantIdx: index('subscriptions_restaurant_id_idx').on(table.restaurantId),
    restaurantUniqueIdx: uniqueIndex('subscriptions_restaurant_id_unique_idx').on(table.restaurantId),
    stripeSubscriptionIdx: index('subscriptions_stripe_subscription_id_idx').on(table.stripeSubscriptionId),
    stripePriceIdx: index('subscriptions_stripe_price_id_idx').on(table.stripePriceId),
  }),
);

export const planUsage = pgTable(
  'plan_usage',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    plan: planEnum('plan').notNull(),
    monthlyLimit: integer('monthly_limit'),
    conversationsUsed: integer('conversations_used').notNull().default(0),
    conversationsRemaining: integer('conversations_remaining'),
    additionalUsage: integer('additional_usage').notNull().default(0),
    estimatedAdditionalAmount: numeric('estimated_additional_amount', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    categories: jsonb('categories').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    restaurantPeriodIdx: uniqueIndex('plan_usage_restaurant_period_idx').on(table.restaurantId, table.periodStart),
  }),
);

export const messageUsage = pgTable(
  'message_usage',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    type: messageUsageTypeEnum('type').notNull(),
    quantity: integer('quantity').notNull().default(1),
    billableQuantity: integer('billable_quantity').notNull().default(0),
    stripeMeterEventId: text('stripe_meter_event_id'),
    stripeReportedAt: timestamp('stripe_reported_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    restaurantMonthIdx: index('message_usage_restaurant_month_idx').on(
      table.restaurantId,
      table.type,
      table.createdAt,
    ),
  }),
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id'),
    oldData: jsonb('old_data'),
    newData: jsonb('new_data'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    restaurantIdx: index('audit_logs_restaurant_id_idx').on(table.restaurantId),
  }),
);

export const stripeWebhookEvents = pgTable('stripe_webhook_events', {
  eventId: text('event_id').primaryKey(),
  eventType: text('event_type').notNull(),
  status: text('status').notNull().default('processing'),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const webhookReplayNonces = pgTable('webhook_replay_nonces', {
  key: text('key').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const restaurantRelations = relations(restaurants, ({ many }) => ({
  users: many(users),
  customers: many(customers),
}));

export const orderRelations = relations(orders, ({ many }) => ({
  items: many(orderItems),
}));

export const orderItemRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
}));
