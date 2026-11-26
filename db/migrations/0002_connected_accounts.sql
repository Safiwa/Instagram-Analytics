-- Creators who connect their own Instagram professional account through
-- Business Login for Instagram. Their token unlocks first-party insights
-- (audience demographics, reach, views, saves) that public data cannot show.
--
-- Access rule: each connected account owns its own rows. The browser only
-- ever holds a signed session cookie naming one connected_accounts.id; every
-- read of private data is scoped to that id in src/core/db/connected.ts.
-- Access tokens are stored AES-256-GCM encrypted (CONNECT_SECRET), never in
-- plain text, and are deleted with the row on disconnect or a Meta
-- deauthorize/data-deletion callback.

create table if not exists connected_accounts (
  id uuid primary key default gen_random_uuid(),
  -- Instagram-scoped user id returned by Business Login (stable per app).
  ig_user_id text not null unique,
  username text not null
    check (username = lower(username) and username ~ '^[a-z0-9._]{1,30}$'),
  account_type text,
  access_token_enc text not null,
  token_expires_at timestamptz not null,
  token_refreshed_at timestamptz not null default now(),
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists connected_accounts_username_idx on connected_accounts (username);
create index if not exists connected_accounts_synced_idx on connected_accounts (last_synced_at asc nulls first);

-- One row per connected account per UTC day: account-level metrics for the
-- previous 28 days and follower demographics at capture time.
create table if not exists account_insights (
  id uuid primary key default gen_random_uuid(),
  connected_account_id uuid not null references connected_accounts (id) on delete cascade,
  captured_on date not null,
  captured_at timestamptz not null default now(),
  followers bigint check (followers >= 0),
  metrics jsonb not null default '{}',
  demographics jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_insights_one_per_day unique (connected_account_id, captured_on)
);
