export type CustomerStatus = 'active' | 'inactive' | 'vip' | 'new';
export type CustomerOrigin = 'whatsapp' | 'instagram' | 'referral' | 'delivery' | 'in_person';
export type ReservationStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
export type OrderStatus = 'received' | 'preparing' | 'delivered' | 'cancelled';
export type OrderChannel = 'dining_room' | 'delivery' | 'whatsapp' | 'ifood' | 'phone';
export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused';

export interface Restaurant {
  id: string;
  name: string;
  plan: 'free' | 'plus' | 'starter' | 'pro' | 'premium' | 'lifetime' | 'founder_lifetime';
  status: 'active' | 'trialing' | 'past_due' | 'cancelled';
}

export interface Profile {
  id: string;
  restaurant_id: string;
  full_name: string;
  role: 'owner' | 'admin' | 'manager' | 'agent';
}

export interface Customer {
  id: string;
  restaurant_id: string;
  name: string;
  phone: string;
  avatar_url?: string | null;
  email?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  tags: string[];
  preferences?: string | null;
  notes?: string | null;
  last_visit?: string | null;
  total_spent: number;
  orders_count: number;
  loyalty_score: number;
  status: CustomerStatus;
  origin: CustomerOrigin;
  created_at: string;
}

export interface Reservation {
  id: string;
  restaurant_id: string;
  customer_id?: string | null;
  customer_name: string;
  phone: string;
  reservation_date: string;
  reservation_time: string;
  party_size: number;
  table_label?: string | null;
  status: ReservationStatus;
  notes?: string | null;
}

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  category: string;
}

export interface Order {
  id: string;
  restaurant_id: string;
  customer_id?: string | null;
  customer_name: string;
  items: OrderItem[];
  total_amount: number;
  order_date: string;
  channel: OrderChannel;
  status: OrderStatus;
  payment_method: string;
  payment_status?: 'pending' | 'paid' | 'failed' | 'unknown';
  pix_charge_id?: string | null;
  notes?: string | null;
}

export interface Campaign {
  id: string;
  restaurant_id: string;
  name: string;
  type: 'birthday' | 'inactive_customer' | 'promotion' | 'weekend' | 'coupon' | 'special_event' | 'post_sale' | 'winback';
  audience: string;
  message: string;
  channel: 'whatsapp' | 'email' | 'sms';
  scheduled_at?: string | null;
  status: CampaignStatus;
  sent_count: number;
  delivered_count: number;
  replied_count: number;
  converted_count: number;
  estimated_revenue: number;
}

export interface Automation {
  id: string;
  title: string;
  trigger: string;
  audience?: string | null;
  action?: string | null;
  channel: string;
  status: 'active' | 'paused';
  impact: string;
  message?: string | null;
}

export interface WhatsAppSendResult {
  success: true;
  message_id: string;
  queued?: boolean;
}

export interface WhatsAppMessage {
  id: string;
  customer_id?: string | null;
  phone: string;
  body: string;
  direction: 'inbound' | 'outbound';
  provider: string;
  created_at: string;
}

export interface WhatsAppConversation {
  id: string;
  customer_id?: string | null;
  customer_name: string;
  phone: string;
  avatar_url?: string | null;
  last_message_at: string;
  tags: string[];
  last_visit?: string | null;
  orders_count: number;
  messages: WhatsAppMessage[];
}

export interface ChatMessage {
  id: string;
  customer_name: string;
  phone: string;
  body: string;
  direction: 'inbound' | 'outbound';
  created_at: string;
}
