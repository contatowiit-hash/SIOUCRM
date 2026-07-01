alter table users add column if not exists google_id text;

create unique index if not exists users_google_id_idx on users (google_id);
