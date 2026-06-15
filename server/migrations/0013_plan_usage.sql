CREATE TABLE IF NOT EXISTS plan_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  plan plan NOT NULL,
  monthly_limit INTEGER,
  conversations_used INTEGER NOT NULL DEFAULT 0,
  conversations_remaining INTEGER,
  additional_usage INTEGER NOT NULL DEFAULT 0,
  estimated_additional_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  categories JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS plan_usage_restaurant_period_idx
  ON plan_usage (restaurant_id, period_start);
