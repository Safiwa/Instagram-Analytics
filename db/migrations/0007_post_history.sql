-- Up to a year of an account's public post metrics (date, type, likes,
-- comments, views), fetched from Instagram Business Discovery at most once a
-- day per account. No captions or media are stored.
create table if not exists post_history (
  username text primary key check (username ~ '^[a-z0-9._]{1,30}$'),
  fetched_at timestamptz not null default now(),
  posts jsonb not null default '[]'::jsonb
);
