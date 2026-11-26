-- Paid plans: site accounts (email sign-in), Lemon Squeezy subscriptions,
-- metered profile lookups and each account's daily-tracked handles.
--
-- Access rule: the browser only holds a signed session cookie naming one
-- site_users.id; every read below is scoped to that id in
-- src/core/billing/accounts.ts. Card details never reach this database:
-- Lemon Squeezy (merchant of record) holds them and only sends subscription
-- state through the signed webhook.

create table if not exists site_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and position('@' in email) > 1),
  last_login_email_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references site_users (id) on delete cascade,
  ls_subscription_id text not null unique,
  ls_customer_id text,
  ls_variant_id text,
  plan text not null check (plan in ('starter', 'pro', 'agency')),
  status text not null,
  trial_ends_at timestamptz,
  renews_at timestamptz,
  ends_at timestamptz,
  customer_portal_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_idx on subscriptions (user_id);

-- One row per subject, billing period and handle: looking at the same profile
-- again in the same period is free. subject is "user:<uuid>" or "ip:<hmac>".
create table if not exists usage_lookups (
  subject text not null,
  period text not null,
  username text not null check (username ~ '^[a-z0-9._]{1,30}$'),
  created_at timestamptz not null default now(),
  primary key (subject, period, username)
);

create table if not exists user_tracked_handles (
  user_id uuid not null references site_users (id) on delete cascade,
  username text not null check (username ~ '^[a-z0-9._]{1,30}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, username)
);
