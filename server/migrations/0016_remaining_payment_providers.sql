alter table payment_connections
  drop constraint if exists payment_connections_status_check;

alter table payment_connections
  add constraint payment_connections_status_check
  check (status in ('not_configured', 'connected', 'disconnected', 'error'));

create table if not exists integration_webhook_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  payment_connection_id uuid references payment_connections(id) on delete set null,
  provider text not null,
  event_type text,
  provider_event_id text,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received', 'processed', 'failed')),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists integration_webhook_events_restaurant_received_idx
  on integration_webhook_events (restaurant_id, received_at desc);

create unique index if not exists integration_webhook_events_provider_event_idx
  on integration_webhook_events (provider, provider_event_id)
  where provider_event_id is not null;

insert into payment_connections (restaurant_id, provider, status)
select restaurants.id, providers.provider, 'not_configured'
from restaurants
cross join (
  values
    ('stone'),
    ('pagbank'),
    ('cielo'),
    ('getnet'),
    ('rede'),
    ('ton'),
    ('safrapay'),
    ('infinitepay')
) as providers(provider)
on conflict (restaurant_id, provider) do nothing;
