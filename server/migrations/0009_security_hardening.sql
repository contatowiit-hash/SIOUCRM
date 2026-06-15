create table if not exists stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  status text not null default 'processing',
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists webhook_replay_nonces (
  key text primary key,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists webhook_replay_nonces_expires_at_idx
  on webhook_replay_nonces(expires_at);
