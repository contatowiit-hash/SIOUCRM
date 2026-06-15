alter table if exists restaurants alter column plan set default 'free';
alter table if exists restaurants alter column status set default 'active';

update restaurants r
set plan = 'free', status = 'active', updated_at = now()
where r.plan in ('starter', 'pro')
  and r.status = 'trialing'
  and coalesce(r.is_deleted, false) = false
  and not exists (
    select 1
    from subscriptions s
    where s.restaurant_id = r.id
      and s.status = 'active'
      and s.provider_subscription_id is not null
      and coalesce(s.is_deleted, false) = false
  );
