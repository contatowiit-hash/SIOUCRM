alter type plan add value if not exists 'plus';

alter table if exists subscriptions
  add column if not exists stripe_subscription_id text;

alter table if exists subscriptions
  alter column plan set default 'free';

alter table if exists subscriptions
  alter column status set default 'active';

alter table if exists subscriptions
  alter column expires_at drop not null;

update subscriptions
set stripe_subscription_id = provider_subscription_id
where stripe_subscription_id is null
  and provider_subscription_id is not null;

create unique index if not exists subscriptions_restaurant_id_unique_idx
  on subscriptions(restaurant_id);

create index if not exists subscriptions_stripe_subscription_id_idx
  on subscriptions(stripe_subscription_id);

create index if not exists subscriptions_provider_subscription_id_idx
  on subscriptions(provider_subscription_id);
