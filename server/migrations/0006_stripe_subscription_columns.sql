alter table if exists subscriptions
  add column if not exists provider_customer_id text;

alter table if exists subscriptions
  add column if not exists provider_subscription_id text;

alter table if exists subscriptions
  add column if not exists stripe_subscription_id text;

alter table if exists subscriptions
  add column if not exists stripe_price_id text;

create index if not exists subscriptions_provider_customer_id_idx
  on subscriptions(provider_customer_id);

create index if not exists subscriptions_provider_subscription_id_idx
  on subscriptions(provider_subscription_id);

create index if not exists subscriptions_stripe_subscription_id_idx
  on subscriptions(stripe_subscription_id);

create index if not exists subscriptions_stripe_price_id_idx
  on subscriptions(stripe_price_id);
