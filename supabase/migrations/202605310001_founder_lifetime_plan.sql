alter table public.restaurants
  drop constraint if exists restaurants_plan_check;

alter table public.restaurants
  add constraint restaurants_plan_check
  check (plan in ('free', 'starter', 'pro', 'premium', 'founder_lifetime'));

alter table public.subscriptions
  add column if not exists lifetime boolean not null default false;

alter table public.subscriptions
  drop constraint if exists subscriptions_plan_check;

alter table public.subscriptions
  add constraint subscriptions_plan_check
  check (plan in ('free', 'starter', 'pro', 'premium', 'founder_lifetime'));
