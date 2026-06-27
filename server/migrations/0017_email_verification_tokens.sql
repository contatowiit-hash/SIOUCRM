create table if not exists email_verification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists email_verification_tokens_user_id_idx on email_verification_tokens(user_id);
create unique index if not exists email_verification_tokens_token_hash_idx on email_verification_tokens(token_hash);
