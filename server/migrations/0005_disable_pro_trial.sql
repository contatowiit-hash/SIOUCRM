update restaurants r
set plan = 'free', status = 'active', updated_at = now()
where r.status = 'trialing'
  and r.plan in ('starter', 'pro')
  and coalesce(r.is_deleted, false) = false
  and not exists (
    select 1
    from subscriptions s
    where s.restaurant_id = r.id
      and s.status = 'active'
      and (
        s.provider_subscription_id is not null
        or s.stripe_subscription_id is not null
        or s.lifetime = true
      )
      and coalesce(s.is_deleted, false) = false
  );

update subscriptions s
set plan = 'free',
    status = 'cancelled',
    lifetime = false,
    expires_at = null,
    updated_at = now()
where s.status = 'trialing'
  and s.plan in ('starter', 'pro')
  and s.provider_subscription_id is null
  and s.stripe_subscription_id is null
  and coalesce(s.is_deleted, false) = false;
