create extension if not exists pgcrypto;

do $$ begin create type role as enum ('owner', 'admin', 'manager', 'agent'); exception when duplicate_object then null; end $$;
do $$ begin create type plan as enum ('free', 'starter', 'pro', 'premium', 'founder_lifetime'); exception when duplicate_object then null; end $$;
alter type plan add value if not exists 'founder_lifetime';
do $$ begin create type account_status as enum ('active', 'trialing', 'past_due', 'cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type customer_status as enum ('active', 'inactive', 'vip', 'new'); exception when duplicate_object then null; end $$;
do $$ begin create type customer_origin as enum ('whatsapp', 'instagram', 'referral', 'delivery', 'in_person'); exception when duplicate_object then null; end $$;
do $$ begin create type reservation_status as enum ('pending', 'confirmed', 'cancelled', 'completed', 'no_show'); exception when duplicate_object then null; end $$;
do $$ begin create type order_status as enum ('received', 'preparing', 'delivered', 'cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type order_channel as enum ('dining_room', 'delivery', 'whatsapp', 'ifood', 'phone'); exception when duplicate_object then null; end $$;
do $$ begin create type campaign_type as enum ('birthday', 'inactive_customer', 'promotion', 'weekend', 'coupon', 'special_event', 'post_sale', 'winback'); exception when duplicate_object then null; end $$;
do $$ begin create type campaign_status as enum ('draft', 'scheduled', 'sending', 'sent', 'paused'); exception when duplicate_object then null; end $$;
do $$ begin create type message_direction as enum ('inbound', 'outbound'); exception when duplicate_object then null; end $$;
do $$ begin create type automation_status as enum ('active', 'paused'); exception when duplicate_object then null; end $$;
do $$ begin create type subscription_status as enum ('trialing', 'active', 'past_due', 'cancelled', 'expired'); exception when duplicate_object then null; end $$;

create or replace function update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,90}$'),
  plan plan not null default 'free',
  status account_status not null default 'active',
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  is_deleted boolean not null default false
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 100),
  email text not null unique check (char_length(email) <= 255),
  password_hash text not null,
  role role not null default 'owner',
  email_verified_at timestamptz,
  failed_login_attempts integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  is_deleted boolean not null default false
);

create table if not exists refresh_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  user_agent text,
  ip_address text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  phone text not null check (phone ~ '^\+?[1-9][0-9]{7,14}$'),
  email text check (email is null or char_length(email) <= 255),
  birth_date date check (birth_date is null or (birth_date >= date '1900-01-01' and birth_date <= current_date)),
  gender text check (gender is null or char_length(gender) <= 40),
  tags text[] not null default '{}',
  preferences text check (preferences is null or char_length(preferences) <= 1000),
  notes text check (notes is null or char_length(notes) <= 1000),
  last_visit date,
  total_spent numeric(12,2) not null default 0 check (total_spent >= 0),
  orders_count integer not null default 0 check (orders_count >= 0),
  loyalty_score integer not null default 0 check (loyalty_score between 0 and 100),
  status customer_status not null default 'new',
  origin customer_origin not null default 'whatsapp',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  is_deleted boolean not null default false,
  unique (restaurant_id, phone)
);

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  customer_name text not null check (char_length(customer_name) between 2 and 100),
  phone text not null check (phone ~ '^\+?[1-9][0-9]{7,14}$'),
  reservation_date date not null,
  reservation_time text not null check (reservation_time ~ '^\d{2}:\d{2}$'),
  party_size integer not null check (party_size between 1 and 80),
  table_label text check (table_label is null or char_length(table_label) <= 30),
  status reservation_status not null default 'pending',
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  is_deleted boolean not null default false
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  customer_name text not null check (char_length(customer_name) between 2 and 100),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  order_date timestamptz not null default now(),
  channel order_channel not null,
  status order_status not null default 'received',
  payment_method text not null check (char_length(payment_method) between 2 and 60),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  is_deleted boolean not null default false
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  quantity integer not null check (quantity between 1 and 999),
  price numeric(12,2) not null check (price >= 0),
  category text not null check (char_length(category) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  is_deleted boolean not null default false
);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  type campaign_type not null,
  audience text not null check (char_length(audience) between 2 and 160),
  message text not null check (char_length(message) between 4 and 4096),
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'email', 'sms')),
  scheduled_at timestamptz,
  status campaign_status not null default 'draft',
  sent_count integer not null default 0,
  delivered_count integer not null default 0,
  replied_count integer not null default 0,
  converted_count integer not null default 0,
  estimated_revenue numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  is_deleted boolean not null default false
);

create table if not exists whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  phone text not null check (phone ~ '^\+?[1-9][0-9]{7,14}$'),
  status text not null default 'open',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  is_deleted boolean not null default false,
  unique (restaurant_id, phone)
);

create table if not exists whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  conversation_id uuid references whatsapp_conversations(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  phone text not null check (phone ~ '^\+?[1-9][0-9]{7,14}$'),
  direction message_direction not null,
  body text not null check (char_length(body) between 1 and 4096),
  provider text not null default 'manual',
  provider_message_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  is_deleted boolean not null default false
);

create table if not exists automations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  trigger_type text not null check (char_length(trigger_type) <= 80),
  config jsonb not null default '{}',
  status automation_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  is_deleted boolean not null default false
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  provider text not null default 'stripe',
  provider_customer_id text,
  provider_subscription_id text,
  plan plan not null,
  status subscription_status not null,
  lifetime boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  is_deleted boolean not null default false
);

alter table if exists subscriptions add column if not exists lifetime boolean not null default false;

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  action text not null check (char_length(action) <= 120),
  resource_type text not null check (char_length(resource_type) <= 80),
  resource_id uuid,
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists rate_limits (
  key text primary key,
  count integer not null default 0,
  window_start timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists users_restaurant_id_idx on users(restaurant_id);
create index if not exists customers_restaurant_id_idx on customers(restaurant_id);
create index if not exists customers_email_idx on customers(email);
create index if not exists customers_birth_date_idx on customers(birth_date);
create index if not exists customers_status_idx on customers(restaurant_id, status);
create index if not exists reservations_restaurant_id_idx on reservations(restaurant_id);
create index if not exists reservations_date_idx on reservations(restaurant_id, reservation_date);
create index if not exists orders_restaurant_id_idx on orders(restaurant_id);
create index if not exists orders_customer_id_idx on orders(customer_id);
create index if not exists order_items_restaurant_id_idx on order_items(restaurant_id);
create index if not exists order_items_order_id_idx on order_items(order_id);
create index if not exists campaigns_restaurant_id_idx on campaigns(restaurant_id);
create index if not exists whatsapp_conversations_restaurant_id_idx on whatsapp_conversations(restaurant_id);
create index if not exists whatsapp_messages_restaurant_id_idx on whatsapp_messages(restaurant_id);
create index if not exists whatsapp_messages_phone_idx on whatsapp_messages(restaurant_id, phone);
create index if not exists automations_restaurant_id_idx on automations(restaurant_id);
create index if not exists subscriptions_restaurant_id_idx on subscriptions(restaurant_id);
create index if not exists audit_logs_restaurant_id_idx on audit_logs(restaurant_id);
create index if not exists refresh_sessions_user_id_idx on refresh_sessions(user_id);
create index if not exists rate_limits_expires_at_idx on rate_limits(expires_at);

drop trigger if exists restaurants_set_updated_at on restaurants;
create trigger restaurants_set_updated_at before update on restaurants for each row execute function update_updated_at();
drop trigger if exists users_set_updated_at on users;
create trigger users_set_updated_at before update on users for each row execute function update_updated_at();
drop trigger if exists customers_set_updated_at on customers;
create trigger customers_set_updated_at before update on customers for each row execute function update_updated_at();
drop trigger if exists reservations_set_updated_at on reservations;
create trigger reservations_set_updated_at before update on reservations for each row execute function update_updated_at();
drop trigger if exists orders_set_updated_at on orders;
create trigger orders_set_updated_at before update on orders for each row execute function update_updated_at();
drop trigger if exists order_items_set_updated_at on order_items;
create trigger order_items_set_updated_at before update on order_items for each row execute function update_updated_at();
drop trigger if exists campaigns_set_updated_at on campaigns;
create trigger campaigns_set_updated_at before update on campaigns for each row execute function update_updated_at();
drop trigger if exists whatsapp_conversations_set_updated_at on whatsapp_conversations;
create trigger whatsapp_conversations_set_updated_at before update on whatsapp_conversations for each row execute function update_updated_at();
drop trigger if exists whatsapp_messages_set_updated_at on whatsapp_messages;
create trigger whatsapp_messages_set_updated_at before update on whatsapp_messages for each row execute function update_updated_at();
drop trigger if exists automations_set_updated_at on automations;
create trigger automations_set_updated_at before update on automations for each row execute function update_updated_at();
drop trigger if exists subscriptions_set_updated_at on subscriptions;
create trigger subscriptions_set_updated_at before update on subscriptions for each row execute function update_updated_at();
