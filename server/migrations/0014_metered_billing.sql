alter table restaurants
  add column if not exists stripe_ai_meter_item_id text,
  add column if not exists stripe_whatsapp_meter_item_id text;

do $$
begin
  create type message_usage_type as enum ('ai', 'whatsapp');
exception
  when duplicate_object then null;
end $$;

create table if not exists message_usage (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  type message_usage_type not null,
  quantity integer not null default 1 check (quantity > 0),
  billable_quantity integer not null default 0 check (billable_quantity >= 0),
  stripe_meter_event_id text,
  stripe_reported_at timestamptz,
  created_at timestamptz not null default now()
);

alter table message_usage
  add column if not exists billable_quantity integer not null default 0 check (billable_quantity >= 0);

create index if not exists message_usage_restaurant_month_idx
  on message_usage (restaurant_id, type, created_at);

create index if not exists message_usage_pending_meter_idx
  on message_usage (restaurant_id, created_at)
  where billable_quantity > 0 and stripe_reported_at is null;
