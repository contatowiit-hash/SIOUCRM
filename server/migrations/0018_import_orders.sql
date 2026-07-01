create table if not exists import_batches (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  file_name text not null,
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  invalid_rows integer not null default 0,
  imported_rows integer not null default 0,
  customers_created integer not null default 0,
  customers_updated integer not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists import_batches_restaurant_id_idx on import_batches(restaurant_id, created_at);

create table if not exists imported_orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  order_id uuid references orders(id) on delete set null,
  import_batch_id uuid references import_batches(id) on delete cascade,
  row_hash text not null,
  customer_name text not null,
  customer_phone text not null,
  ordered_at timestamptz not null,
  product text not null,
  category text,
  quantity integer not null,
  unit_price numeric(12, 2) not null,
  total_price numeric(12, 2) not null,
  payment_method text,
  status text,
  notes text,
  created_at timestamptz not null default now(),
  unique (restaurant_id, row_hash)
);

create index if not exists imported_orders_restaurant_id_idx on imported_orders(restaurant_id, ordered_at);
create index if not exists imported_orders_batch_id_idx on imported_orders(import_batch_id);
