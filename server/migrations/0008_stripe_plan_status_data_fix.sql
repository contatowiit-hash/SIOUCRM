update subscriptions
set plan = 'plus',
    updated_at = now()
where plan = 'starter';

update restaurants
set plan = 'plus',
    updated_at = now()
where plan = 'starter';

update subscriptions
set plan = 'lifetime',
    updated_at = now()
where plan = 'founder_lifetime';

update restaurants
set plan = 'lifetime',
    updated_at = now()
where plan = 'founder_lifetime';

update subscriptions
set status = 'active',
    updated_at = now()
where status = 'trialing';

update restaurants
set status = 'active',
    updated_at = now()
where status = 'trialing';

update subscriptions
set status = 'canceled',
    updated_at = now()
where status = 'cancelled';

update subscriptions
set status = 'past_due',
    updated_at = now()
where status = 'expired';

update subscriptions
set plan = 'plus',
    updated_at = now()
where stripe_price_id = 'price_1TdNCkJnc9f1Q8NkzXtipV4t';

update subscriptions
set plan = 'pro',
    updated_at = now()
where stripe_price_id = 'price_1TdNHXJnc9f1Q8Nk6kkDuqkz';

update subscriptions
set plan = 'premium',
    updated_at = now()
where stripe_price_id = 'price_1TdNJQJnc9f1Q8Nk6nWcWo3X';

update subscriptions
set plan = 'lifetime',
    updated_at = now()
where stripe_price_id = 'price_1TdNLsJnc9f1Q8NkSBOGG7M2';
