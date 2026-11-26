-- Follower-list audit for connected creators. Meta's API cannot list an
-- account's followers, so the owner uploads the followers file from
-- Instagram's "Download your information" export. Each listed follower's
-- public profile is then checked against the site's fake-follower rules
-- (src/core/analytics/followerAudit.ts).
--
-- Data minimisation: only what the rules score is kept. Bio and name text are
-- reduced to has_bio / has_name flags; no follower content is stored. Rows
-- belong to one connected account and are deleted with it (disconnect,
-- deauthorize or data-deletion callback) or replaced by a new upload.

alter table connected_accounts add column if not exists followers_uploaded_at timestamptz;
alter table connected_accounts add column if not exists followers_in_upload integer
  check (followers_in_upload >= 0);

create table if not exists follower_checks (
  id uuid primary key default gen_random_uuid(),
  connected_account_id uuid not null references connected_accounts (id) on delete cascade,
  username text not null check (username ~ '^[a-z0-9._]{1,30}$'),
  status text not null default 'pending' check (status in ('pending', 'checked', 'unavailable')),
  attempts smallint not null default 0 check (attempts >= 0),
  posts bigint check (posts >= 0),
  followers bigint check (followers >= 0),
  following bigint check (following >= 0),
  has_profile_pic boolean,
  has_name boolean,
  has_bio boolean,
  is_private boolean,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint follower_checks_one_per_follower unique (connected_account_id, username)
);

create index if not exists follower_checks_pending_idx on follower_checks (status, attempts)
  where status = 'pending';
