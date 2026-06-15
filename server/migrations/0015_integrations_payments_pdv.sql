create table if not exists payment_connections (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  provider text not null,
  status text not null default 'disconnected' check (status in ('connected', 'disconnected', 'error')),
  access_token text,
  refresh_token text,
  external_account_id text,
  connected_at timestamptz,
  last_event_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, provider)
);

create index if not exists payment_connections_external_account_idx
  on payment_connections (provider, external_account_id);

create table if not exists pdv_connections (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  provider text not null,
  status text not null default 'disconnected' check (status in ('connected', 'disconnected', 'error')),
  integration_token text,
  webhook_url text,
  connected_at timestamptz,
  last_event_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, provider)
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  order_id uuid references orders(id) on delete set null,
  external_sale_id text not null,
  total_amount numeric(12,2) not null check (total_amount >= 0),
  source text not null,
  payment_status text not null default 'unknown' check (payment_status in ('pending', 'paid', 'failed', 'unknown')),
  payment_method text not null default 'unknown' check (payment_method in ('pix', 'card', 'cash', 'unknown')),
  pix_charge_id text,
  items jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, source, external_sale_id)
);

create index if not exists transactions_restaurant_occurred_idx
  on transactions (restaurant_id, occurred_at desc);

alter table orders
  add column if not exists payment_status text not null default 'unknown'
    check (payment_status in ('pending', 'paid', 'failed', 'unknown')),
  add column if not exists pix_charge_id text;
