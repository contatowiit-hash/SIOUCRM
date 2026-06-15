create extension if not exists pgcrypto;

create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,80}$'),
  plan text not null default 'free' check (plan in ('free', 'starter', 'pro', 'premium', 'founder_lifetime')),
  status text not null default 'active' check (status in ('active', 'trialing', 'past_due', 'cancelled')),
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  is_deleted boolean not null default false
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 100),
  role text not null default 'owner' check (role in ('owner', 'admin', 'manager', 'agent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.get_user_restaurant_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select restaurant_id from public.profiles where id = auth.uid()
$$;

create or replace function public.get_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.unaccent_safe(value text)
returns text
language plpgsql
immutable
as $$
begin
  return translate(
    value,
    'áàãâäéèêëíìîïóòõôöúùûüçñÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
  );
end;
$$;

create or replace function public.slugify(value text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(public.unaccent_safe(value)), '[^a-z0-9]+', '-', 'g'))
$$;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
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
  status text not null default 'new' check (status in ('active', 'inactive', 'vip', 'new')),
  origin text not null default 'whatsapp' check (origin in ('whatsapp', 'instagram', 'referral', 'delivery', 'in_person')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  is_deleted boolean not null default false,
  unique (restaurant_id, phone)
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null check (char_length(customer_name) between 2 and 100),
  phone text not null check (phone ~ '^\+?[1-9][0-9]{7,14}$'),
  reservation_date date not null,
  reservation_time time not null,
  party_size integer not null check (party_size between 1 and 80),
  table_label text check (table_label is null or char_length(table_label) <= 30),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  is_deleted boolean not null default false
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null check (char_length(customer_name) between 2 and 100),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  order_date timestamptz not null default now(),
  channel text not null check (channel in ('dining_room', 'delivery', 'whatsapp', 'ifood', 'phone')),
  status text not null default 'received' check (status in ('received', 'preparing', 'delivered', 'cancelled')),
  payment_method text not null check (char_length(payment_method) between 2 and 60),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  is_deleted boolean not null default false
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  quantity integer not null check (quantity between 1 and 999),
  price numeric(12,2) not null check (price >= 0),
  category text not null check (char_length(category) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  is_deleted boolean not null default false
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  type text not null check (type in ('birthday', 'inactive_customer', 'promotion', 'weekend', 'coupon', 'special_event', 'post_sale', 'winback')),
  audience text not null check (char_length(audience) between 2 and 160),
  message text not null check (char_length(message) between 4 and 4096),
  channel text not null check (channel in ('whatsapp', 'email', 'sms')),
  scheduled_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'paused')),
  sent_count integer not null default 0 check (sent_count >= 0),
  delivered_count integer not null default 0 check (delivered_count >= 0),
  replied_count integer not null default 0 check (replied_count >= 0),
  converted_count integer not null default 0 check (converted_count >= 0),
  estimated_revenue numeric(12,2) not null default 0 check (estimated_revenue >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  is_deleted boolean not null default false
);

create table public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'replied', 'converted', 'failed')),
  sent_at timestamptz,
  delivered_at timestamptz,
  replied_at timestamptz,
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  is_deleted boolean not null default false
);

create table public.birthday_campaigns (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  benefit_type text not null default 'Sobremesa grátis' check (char_length(benefit_type) <= 80),
  days_before integer not null default 7 check (days_before between 0 and 30),
  days_after integer not null default 3 check (days_after between 0 and 30),
  before_message text not null check (char_length(before_message) between 4 and 4096),
  day_message text not null check (char_length(day_message) between 4 and 4096),
  after_message text not null check (char_length(after_message) between 4 and 4096),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  is_deleted boolean not null default false
);

create table public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  phone text not null check (phone ~ '^\+?[1-9][0-9]{7,14}$'),
  status text not null default 'open' check (status in ('open', 'pending', 'closed')),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  is_deleted boolean not null default false,
  unique (restaurant_id, phone)
);

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  conversation_id uuid references public.whatsapp_conversations(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  phone text not null check (phone ~ '^\+?[1-9][0-9]{7,14}$'),
  direction text not null check (direction in ('inbound', 'outbound')),
  body text not null check (char_length(body) between 1 and 4096),
  provider text not null default 'manual' check (char_length(provider) <= 60),
  provider_message_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  is_deleted boolean not null default false
);

create table public.automations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  trigger_type text not null check (char_length(trigger_type) <= 80),
  config jsonb not null default '{}',
  status text not null default 'active' check (status in ('active', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  is_deleted boolean not null default false
);

create table public.automation_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  automation_id uuid references public.automations(id) on delete set null,
  status text not null check (status in ('success', 'failed', 'skipped')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  is_deleted boolean not null default false
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid references auth.users(id),
  action text not null check (char_length(action) <= 120),
  resource_type text not null check (char_length(resource_type) <= 80),
  resource_id uuid,
  old_data jsonb,
  new_data jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table public.webhooks (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  provider text not null check (provider in ('evolution_api', 'z_api', 'meta_cloud_api', 'n8n')),
  endpoint_path text not null unique check (endpoint_path ~ '^[a-z0-9-]{10,120}$'),
  is_active boolean not null default true,
  last_received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  is_deleted boolean not null default false
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  provider text not null default 'stripe' check (provider in ('stripe', 'pagarme', 'mercado_pago')),
  provider_customer_id text,
  provider_subscription_id text,
  plan text not null check (plan in ('free', 'starter', 'pro', 'premium', 'founder_lifetime')),
  status text not null check (status in ('trialing', 'active', 'past_due', 'cancelled', 'expired')),
  lifetime boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  is_deleted boolean not null default false
);

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  provider text not null check (provider in ('evolution_api', 'z_api', 'meta_cloud_api', 'n8n', 'stripe', 'pagarme', 'mercado_pago')),
  status text not null default 'inactive' check (status in ('active', 'inactive', 'error')),
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  is_deleted boolean not null default false,
  unique (restaurant_id, provider)
);

create table public.rate_limits (
  key text primary key,
  count integer not null default 0,
  window_start timestamptz not null default now(),
  expires_at timestamptz not null
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  restaurant_name text;
  base_slug text;
  final_slug text;
  created_restaurant_id uuid;
begin
  restaurant_name := coalesce(new.raw_user_meta_data ->> 'restaurant_name', 'Restaurante');
  base_slug := coalesce(nullif(public.slugify(restaurant_name), ''), 'restaurante');
  final_slug := base_slug || '-' || substring(new.id::text, 1, 8);

  insert into public.restaurants (owner_id, name, slug, plan, status)
  values (new.id, restaurant_name, final_slug, 'free', 'active')
  returning id into created_restaurant_id;

  insert into public.profiles (id, restaurant_id, full_name, role)
  values (
    new.id,
    created_restaurant_id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'owner'
  );

  insert into public.birthday_campaigns (
    restaurant_id,
    benefit_type,
    before_message,
    day_message,
    after_message
  )
  values (
    created_restaurant_id,
    'Sobremesa grátis',
    'Seu aniversário está chegando, {nome}! Temos uma surpresa especial para você.',
    'Feliz aniversário, {nome}! Você ganhou uma sobremesa grátis ou 10% OFF para comemorar com a gente.',
    'Oi, {nome}! Seu presente de aniversário ainda está disponível por pouco tempo.'
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.restaurants enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.reservations enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.birthday_campaigns enable row level security;
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.automations enable row level security;
alter table public.automation_logs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.webhooks enable row level security;
alter table public.subscriptions enable row level security;
alter table public.integrations enable row level security;
alter table public.rate_limits enable row level security;

create policy restaurants_select_own on public.restaurants
  for select using (id = public.get_user_restaurant_id() and is_deleted = false);
create policy restaurants_insert_blocked on public.restaurants
  for insert with check (false);
create policy restaurants_update_own_owner_admin on public.restaurants
  for update using (id = public.get_user_restaurant_id() and public.get_user_role() in ('owner', 'admin'))
  with check (id = public.get_user_restaurant_id());
create policy restaurants_delete_blocked on public.restaurants
  for delete using (false);

create policy profiles_select_own_restaurant on public.profiles
  for select using (restaurant_id = public.get_user_restaurant_id());
create policy profiles_insert_blocked on public.profiles
  for insert with check (false);
create policy profiles_update_self_or_admin on public.profiles
  for update using (restaurant_id = public.get_user_restaurant_id() and (id = auth.uid() or public.get_user_role() in ('owner', 'admin')))
  with check (restaurant_id = public.get_user_restaurant_id());
create policy profiles_delete_blocked on public.profiles
  for delete using (false);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'customers',
    'reservations',
    'orders',
    'order_items',
    'campaigns',
    'campaign_recipients',
    'birthday_campaigns',
    'whatsapp_conversations',
    'whatsapp_messages',
    'automations',
    'automation_logs',
    'webhooks',
    'subscriptions',
    'integrations'
  ]
  loop
    execute format('create policy %I_select_own on public.%I for select using (restaurant_id = public.get_user_restaurant_id() and coalesce(is_deleted, false) = false)', table_name, table_name);
    execute format('create policy %I_insert_own on public.%I for insert with check (restaurant_id = public.get_user_restaurant_id())', table_name, table_name);
    execute format('create policy %I_update_own on public.%I for update using (restaurant_id = public.get_user_restaurant_id()) with check (restaurant_id = public.get_user_restaurant_id())', table_name, table_name);
    execute format('create policy %I_delete_blocked on public.%I for delete using (false)', table_name, table_name);
  end loop;
end;
$$;

create policy audit_logs_select_own on public.audit_logs
  for select using (restaurant_id = public.get_user_restaurant_id());
create policy audit_logs_insert_blocked on public.audit_logs
  for insert with check (false);
create policy audit_logs_update_blocked on public.audit_logs
  for update using (false);
create policy audit_logs_delete_blocked on public.audit_logs
  for delete using (false);

create policy rate_limits_block_all_select on public.rate_limits for select using (false);
create policy rate_limits_block_all_insert on public.rate_limits for insert with check (false);
create policy rate_limits_block_all_update on public.rate_limits for update using (false);
create policy rate_limits_block_all_delete on public.rate_limits for delete using (false);

create trigger restaurants_set_updated_at before update on public.restaurants for each row execute function public.update_updated_at();
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.update_updated_at();
create trigger customers_set_updated_at before update on public.customers for each row execute function public.update_updated_at();
create trigger reservations_set_updated_at before update on public.reservations for each row execute function public.update_updated_at();
create trigger orders_set_updated_at before update on public.orders for each row execute function public.update_updated_at();
create trigger order_items_set_updated_at before update on public.order_items for each row execute function public.update_updated_at();
create trigger campaigns_set_updated_at before update on public.campaigns for each row execute function public.update_updated_at();
create trigger campaign_recipients_set_updated_at before update on public.campaign_recipients for each row execute function public.update_updated_at();
create trigger birthday_campaigns_set_updated_at before update on public.birthday_campaigns for each row execute function public.update_updated_at();
create trigger whatsapp_conversations_set_updated_at before update on public.whatsapp_conversations for each row execute function public.update_updated_at();
create trigger whatsapp_messages_set_updated_at before update on public.whatsapp_messages for each row execute function public.update_updated_at();
create trigger automations_set_updated_at before update on public.automations for each row execute function public.update_updated_at();
create trigger automation_logs_set_updated_at before update on public.automation_logs for each row execute function public.update_updated_at();
create trigger webhooks_set_updated_at before update on public.webhooks for each row execute function public.update_updated_at();
create trigger subscriptions_set_updated_at before update on public.subscriptions for each row execute function public.update_updated_at();
create trigger integrations_set_updated_at before update on public.integrations for each row execute function public.update_updated_at();

create index idx_profiles_restaurant_id on public.profiles(restaurant_id);
create index idx_customers_restaurant_id on public.customers(restaurant_id);
create index idx_customers_phone on public.customers(phone);
create index idx_customers_email on public.customers(email);
create index idx_customers_birth_date on public.customers(birth_date);
create index idx_customers_status on public.customers(restaurant_id, status);
create index idx_reservations_restaurant_id on public.reservations(restaurant_id);
create index idx_reservations_date on public.reservations(restaurant_id, reservation_date);
create index idx_orders_restaurant_id on public.orders(restaurant_id);
create index idx_orders_customer_id on public.orders(customer_id);
create index idx_orders_date on public.orders(restaurant_id, order_date);
create index idx_order_items_restaurant_id on public.order_items(restaurant_id);
create index idx_order_items_order_id on public.order_items(order_id);
create index idx_campaigns_restaurant_id on public.campaigns(restaurant_id);
create index idx_campaign_recipients_restaurant_id on public.campaign_recipients(restaurant_id);
create index idx_birthday_campaigns_restaurant_id on public.birthday_campaigns(restaurant_id);
create index idx_whatsapp_conversations_restaurant_id on public.whatsapp_conversations(restaurant_id);
create index idx_whatsapp_messages_restaurant_id on public.whatsapp_messages(restaurant_id);
create index idx_whatsapp_messages_phone on public.whatsapp_messages(restaurant_id, phone);
create index idx_automations_restaurant_id on public.automations(restaurant_id);
create index idx_automation_logs_restaurant_id on public.automation_logs(restaurant_id);
create index idx_audit_logs_restaurant_id on public.audit_logs(restaurant_id);
create index idx_webhooks_restaurant_id on public.webhooks(restaurant_id);
create index idx_subscriptions_restaurant_id on public.subscriptions(restaurant_id);
create index idx_integrations_restaurant_id on public.integrations(restaurant_id);
create index idx_rate_limits_expires_at on public.rate_limits(expires_at);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('restaurant-assets', 'restaurant-assets', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy restaurant_assets_select_own on storage.objects
  for select using (
    bucket_id = 'restaurant-assets'
    and (storage.foldername(name))[1] = public.get_user_restaurant_id()::text
  );

create policy restaurant_assets_insert_own on storage.objects
  for insert with check (
    bucket_id = 'restaurant-assets'
    and (storage.foldername(name))[1] = public.get_user_restaurant_id()::text
  );

create policy restaurant_assets_update_own on storage.objects
  for update using (
    bucket_id = 'restaurant-assets'
    and (storage.foldername(name))[1] = public.get_user_restaurant_id()::text
  ) with check (
    bucket_id = 'restaurant-assets'
    and (storage.foldername(name))[1] = public.get_user_restaurant_id()::text
  );

create policy restaurant_assets_delete_own on storage.objects
  for delete using (
    bucket_id = 'restaurant-assets'
    and (storage.foldername(name))[1] = public.get_user_restaurant_id()::text
  );
