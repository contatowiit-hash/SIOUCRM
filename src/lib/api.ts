import type {
  Automation,
  Campaign,
  Customer,
  Order,
  Reservation,
  WhatsAppConversation,
  WhatsAppSendResult,
} from '../types/domain';

const normalizeApiBaseUrl = () => {
  const configuredApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (configuredApiUrl) return configuredApiUrl.replace(/\/+$/, '');

  const configuredBackendUrl = (import.meta.env.VITE_BACKEND_URL as string | undefined)?.trim();
  if (configuredBackendUrl) return `${configuredBackendUrl.replace(/\/+$/, '')}/api`;

  return import.meta.env.PROD ? '/api' : 'http://127.0.0.1:3334/api';
};

export const apiBaseUrl = normalizeApiBaseUrl();
export const isApiConfigured = Boolean(apiBaseUrl);

let accessToken: string | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

export const getAccessToken = () => accessToken;

export interface ApiUser {
  id: string;
  email: string;
  full_name: string;
  role: 'owner' | 'admin' | 'manager' | 'agent';
  restaurant_id: string;
  email_verified_at: string | null;
  is_dev?: boolean;
}

export interface ApiRestaurant {
  id: string;
  name: string;
  plan: 'free' | 'plus' | 'starter' | 'pro' | 'premium' | 'lifetime' | 'founder_lifetime';
  status: 'active' | 'trialing' | 'past_due' | 'cancelled';
}

export interface AuthResponse {
  access_token: string;
  user: ApiUser;
  restaurant: ApiRestaurant;
}

let refreshPromise: Promise<AuthResponse> | null = null;

export interface WhatsAppGatewaySession {
  status: 'idle' | 'connecting' | 'qr_ready' | 'connected' | 'disconnected' | 'error';
  qrCode: string | null;
  phoneNumber: string | null;
  connectedAt: string | null;
  error: string | null;
}

export interface AiSettings {
  ai_name: string;
  avatar_url: string | null;
  ai_color: string;
  voice_tone: 'formal' | 'casual' | 'animado';
  behavior_instructions: string;
  menu_text: string;
  menu_pdf_name: string;
  menu_pdf_data: string | null;
  greeting_message: string;
  after_hours_message: string;
  active_start_time: string;
  active_end_time: string;
  normal_delivery_time: string;
  peak_days: string[];
  peak_start_time: string;
  peak_end_time: string;
  peak_delivery_time: string;
  confirm_address: boolean;
  ask_payment_method: boolean;
  accepted_payment_methods: Array<'pix' | 'cartao' | 'dinheiro'>;
  delivery_fee: string;
  served_neighborhoods: string;
  minimum_order: number;
  local_pickup: boolean;
  auto_offer_addons: boolean;
  upsell_categories: Array<'bebidas' | 'sobremesas' | 'bordas' | 'porcoes_extras'>;
  offer_combos: boolean;
  upsell_phrase: string;
  active_coupon: string;
  recover_inactive_customer: boolean;
  post_sale_message: string;
  do_not_invent_products: boolean;
  do_not_discount_without_permission: boolean;
  do_not_promise_impossible_delivery: boolean;
  do_not_reply_outside_restaurant: boolean;
  max_discount_percent: number;
  forbidden_words: string[];
  whatsapp_status: 'connected' | 'disconnected';
  auto_replies_enabled: boolean;
  temporarily_paused: boolean;
  transfer_to_human: boolean;
}

export interface AiSettingsResponse {
  access: 'pro' | 'premium';
  plan: ApiRestaurant['plan'];
  data: AiSettings;
  saved?: boolean;
  menu_pdf_processed?: boolean;
  menu_pdf_product_count?: number;
  menu_pdf_categories?: string[];
}

export interface PlanCurrentResponse {
  status: 'within_plan' | 'attention' | 'exceeded';
  usage_level: 'Pouco uso' | 'Uso moderado' | 'Próximo do limite' | 'Limite ultrapassado';
  financials_visible: boolean;
  plan: { id: ApiRestaurant['plan']; name: string; monthly_limit: number | null };
  usage: {
    conversations_used: number;
    conversations_remaining: number | null;
    additional_usage: number;
    progress: number;
    categories: {
      whatsapp_conversations: number;
      automatic_replies: number;
      reservations: number;
      orders: number;
    };
  };
  billing: { will_pay_extra: boolean | null; estimated_additional_amount: number | null };
  period: { start: string; end: string };
}

export interface PaymentIntegrationStatus {
  provider: string;
  name: string;
  status: 'not_configured' | 'connected' | 'disconnected' | 'error';
  available: boolean;
  message: string | null;
  credential_mode?: 'restaurant' | 'platform';
  webhook_url?: string | null;
}

export interface PdvIntegrationStatus {
  provider: string;
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  webhook_url: string | null;
}

class ApiRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

const apiFetchOnce = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  }).catch(() => {
    throw new Error('Backend local desligado. Abra o inicializador do sistema e deixe a janela aberta.');
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { details?: string; error?: string } | null;
    if (response.status === 401) {
      throw new ApiRequestError(body?.error || 'Unauthorized', response.status);
    }
    const devDetails = import.meta.env.DEV && body?.details ? ` Detalhe: ${body.details}` : '';
    throw new Error(`${body?.error || 'Não foi possível completar a ação.'}${devDetails}`);
  }

  return response.json() as Promise<T>;
};

const refreshAccessToken = async () => {
  if (!refreshPromise) {
    refreshPromise = apiFetchOnce<AuthResponse>('/auth/refresh', { method: 'POST' })
      .then((result) => {
        setAccessToken(result.access_token);
        return result;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
};

const apiFetch = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  try {
    return await apiFetchOnce<T>(path, init);
  } catch (error) {
    const canRefresh =
      error instanceof ApiRequestError &&
      error.status === 401 &&
      path !== '/auth/login' &&
      path !== '/auth/refresh' &&
      path !== '/auth/logout';

    if (!canRefresh) {
      if (error instanceof ApiRequestError && error.status === 401) {
        throw new Error('Sessão expirada. Entre novamente.');
      }
      throw error;
    }

    try {
      await refreshAccessToken();
      return await apiFetchOnce<T>(path, init);
    } catch {
      setAccessToken(null);
      throw new Error('Sessão expirada. Entre novamente.');
    }
  }
};

export const api = {
  async login(input: { email: string; password: string }) {
    const result = await apiFetch<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setAccessToken(result.access_token);
    return result;
  },
  async register(input: {
    fullName: string;
    restaurantName: string;
    email: string;
    password: string;
    confirmPassword: string;
  }) {
    return apiFetch<{
      user?: ApiUser;
      restaurant?: ApiRestaurant;
      requires_email_verification: boolean;
      message?: string;
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async resendVerification(input: { email: string }) {
    return apiFetch<{ message: string }>('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async verifyEmail(input: { token: string }) {
    return apiFetch<{ message: string }>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async refresh() {
    return refreshAccessToken();
  },
  async me() {
    return apiFetch<{ user: ApiUser; restaurant: ApiRestaurant }>('/auth/me');
  },
  async logout() {
    try {
      await apiFetch<{ success: true }>('/auth/logout', { method: 'POST' });
    } finally {
      setAccessToken(null);
    }
  },
  async createCheckout(input: { plan: 'plus' | 'pro' | 'premium' | 'lifetime' | 'founder_lifetime' }) {
    return apiFetch<{ url: string; session_id?: string }>('/billing/checkout', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async confirmSession(input: { session_id: string }) {
    return apiFetch<{ restaurant: ApiRestaurant; plan: ApiRestaurant['plan'] }>('/billing/confirm-session', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async currentPlan() {
    return apiFetch<PlanCurrentResponse>('/plan/current');
  },
  async customers() {
    return apiFetch<{ data: Customer[] }>('/customers');
  },
  async createCustomer(input: unknown) {
    return apiFetch<{ data: Customer }>('/customers', { method: 'POST', body: JSON.stringify(input) });
  },
  async deleteCustomer(id: string) {
    return apiFetch<{ success: true }>(`/customers/${id}`, { method: 'DELETE' });
  },
  async reservations() {
    return apiFetch<{ data: Reservation[] }>('/reservations');
  },
  async createReservation(input: unknown) {
    return apiFetch<{ data: Reservation }>('/reservations', { method: 'POST', body: JSON.stringify(input) });
  },
  async updateReservationStatus(id: string, status: Reservation['status']) {
    return apiFetch<{ data: Reservation }>(`/reservations/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },
  async orders() {
    return apiFetch<{ data: Order[] }>('/orders');
  },
  async createOrder(input: unknown) {
    return apiFetch<{ data: Order }>('/orders', { method: 'POST', body: JSON.stringify(input) });
  },
  async campaigns() {
    return apiFetch<{ data: Campaign[] }>('/campaigns');
  },
  async createCampaign(input: unknown) {
    return apiFetch<{ data: Campaign }>('/campaigns', { method: 'POST', body: JSON.stringify(input) });
  },
  async automations() {
    return apiFetch<{ data: Automation[] }>('/automations');
  },
  async createAutomation(input: unknown) {
    return apiFetch<{ data: Automation }>('/automations', { method: 'POST', body: JSON.stringify(input) });
  },
  async updateAutomation(id: string, input: unknown) {
    return apiFetch<{ data: Automation }>(`/automations/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
  },
  async updateAutomationStatus(id: string, status: Automation['status']) {
    return apiFetch<{ data: Automation }>(`/automations/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },
  async sendWhatsApp(input: unknown) {
    return apiFetch<WhatsAppSendResult>('/whatsapp/send', { method: 'POST', body: JSON.stringify(input) });
  },
  async whatsappConversations() {
    return apiFetch<{ data: WhatsAppConversation[] }>('/whatsapp/conversations');
  },
  async whatsappGatewaySession() {
    return apiFetch<WhatsAppGatewaySession>('/whatsapp/gateway/session');
  },
  async startWhatsAppGatewaySession() {
    return apiFetch<{ success: true }>('/whatsapp/gateway/session', { method: 'POST' });
  },
  async stopWhatsAppGatewaySession() {
    return apiFetch<{ success: true }>('/whatsapp/gateway/session', { method: 'DELETE' });
  },
  async sendWhatsAppGatewayText(input: { to: string; message: string }) {
    return apiFetch<{ messageId: string }>('/whatsapp/gateway/messages/text', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async deleteWhatsAppMessage(messageId: string) {
    return apiFetch<{ success: true }>(`/whatsapp/messages/${messageId}`, { method: 'DELETE' });
  },
  async aiSettings() {
    return apiFetch<AiSettingsResponse>('/ai-settings');
  },
  async saveAiSettings(input: AiSettings) {
    return apiFetch<AiSettingsResponse>('/ai-settings', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async paymentIntegrations() {
    return apiFetch<{ data: PaymentIntegrationStatus[] }>('/integrations/payments');
  },
  async pdvIntegrations() {
    return apiFetch<{ data: PdvIntegrationStatus[] }>('/integrations/pdv');
  },
  async connectPayment(provider: string, input?: Record<string, string>) {
    return apiFetch<{ url?: string; action?: 'contact_support'; message?: string; data?: { provider: string; status: string; webhook_url?: string } }>(
      `/integrations/payments/${provider}/connect`,
      { method: 'POST', body: JSON.stringify(input ?? {}) },
    );
  },
  async testPayment(provider: string) {
    return apiFetch<{ data: { provider: string; status: string } }>(`/integrations/payments/${provider}/test`, { method: 'POST' });
  },
  async testPaymentReceipt(provider: string) {
    return apiFetch<{ data: { provider: string; status: 'processed'; checks: string[] } }>(
      `/integrations/payments/${provider}/test-receipt`,
      { method: 'POST' },
    );
  },
  async disconnectPayment(provider: string) {
    return apiFetch<{ success: true }>(`/integrations/payments/${provider}/disconnect`, { method: 'POST' });
  },
  async connectPdv(provider: string, input: string | Record<string, string>) {
    return apiFetch<{ data: PdvIntegrationStatus }>(`/integrations/pdv/${provider}/connect`, {
      method: 'POST',
      body: JSON.stringify(typeof input === 'string' ? { token: input } : input),
    });
  },
  async testPdv(provider: string) {
    return apiFetch<{ data: { provider: string; status: string } }>(`/integrations/pdv/${provider}/test`, { method: 'POST' });
  },
  async disconnectPdv(provider: string) {
    return apiFetch<{ success: true }>(`/integrations/pdv/${provider}/disconnect`, { method: 'POST' });
  },
  async createPixCharge(orderId: string, payerEmail?: string, provider: 'mercado_pago' | 'pagbank' = 'mercado_pago') {
    return apiFetch<{ data: { payment_status: string; qr_code: string | null; qr_code_base64: string | null; ticket_url: string | null } }>(
      `/orders/${orderId}/pix-charge`,
      { method: 'POST', body: JSON.stringify({ ...(payerEmail ? { payer_email: payerEmail } : {}), provider }) },
    );
  },
  async createPaymentLink(orderId: string) {
    return apiFetch<{ data: { url: string; payment_status: string } }>(`/orders/${orderId}/payment-link`, {
      method: 'POST',
      body: JSON.stringify({ provider: 'infinitepay' }),
    });
  },
};
