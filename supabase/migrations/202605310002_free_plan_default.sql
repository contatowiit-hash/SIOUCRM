alter table public.restaurants
  drop constraint if exists restaurants_plan_check;

alter table public.restaurants
  add constraint restaurants_plan_check
  check (plan in ('free', 'starter', 'pro', 'premium', 'founder_lifetime'));

alter table public.restaurants
  alter column plan set default 'free';

alter table public.restaurants
  alter column status set default 'active';

alter table public.subscriptions
  drop constraint if exists subscriptions_plan_check;

alter table public.subscriptions
  add constraint subscriptions_plan_check
  check (plan in ('free', 'starter', 'pro', 'premium', 'founder_lifetime'));

update public.restaurants r
set plan = 'free', status = 'active', updated_at = now()
where r.plan in ('starter', 'pro')
  and r.status = 'trialing'
  and coalesce(r.is_deleted, false) = false
  and not exists (
    select 1
    from public.subscriptions s
    where s.restaurant_id = r.id
      and s.status = 'active'
      and s.provider_subscription_id is not null
      and coalesce(s.is_deleted, false) = false
  );
