-- In-house history store for Instagram Analytics.
--
-- Every non-demo lookup and every daily collector run writes one snapshot per
-- profile per UTC day (later writes on the same day replace earlier ones).
-- Post rows keep their latest caption/type; post_snapshots keep the daily
-- likes/comments/views so engagement can be charted over time.
--
-- Access rule: no table holds user-owned data yet. The database is reached
-- only from server code through DATABASE_URL (src/core/db), never from the
-- browser, so row level security is not enabled. Tables that gain an owner
-- (accounts, saved lists, connected Instagram accounts) must add user_id and
-- an authorisation check in the data layer.
--
-- Times are timestamptz in UTC. captured_on is the UTC calendar day.

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  username text not null unique
    check (username = lower(username) and username ~ '^[a-z0-9._]{1,30}$'),
  display_name text,
  category text,
  account_country text,
  is_verified boolean,
  is_private boolean not null default false,
  profile_picture_url text,
  -- Tracked profiles are refreshed by the daily collector even if nobody looks them up.
  tracked boolean not null default false,
  lookup_count integer not null default 0 check (lookup_count >= 0),
  first_seen_at timestamptz not null default now(),
  last_lookup_at timestamptz,
  last_snapshot_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_last_lookup_idx on profiles (last_lookup_at desc);
create index if not exists profiles_last_snapshot_idx on profiles (last_snapshot_at asc nulls first);
create index if not exists profiles_tracked_idx on profiles (tracked) where tracked;

create table if not exists profile_snapshots (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  captured_on date not null,
  captured_at timestamptz not null default now(),
  followers bigint not null check (followers >= 0),
  following bigint check (following >= 0),
  posts_count bigint check (posts_count >= 0),
  -- Null when no posts were visible: third-party figures are never stored here.
  engagement_rate numeric(10, 4),
  avg_likes numeric(16, 2),
  avg_comments numeric(16, 2),
  avg_views numeric(18, 2),
  visible_posts smallint not null default 0 check (visible_posts >= 0),
  source text not null check (source in ('public', 'live')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_snapshots_one_per_day unique (profile_id, captured_on)
);

create index if not exists profile_snapshots_day_idx on profile_snapshots (captured_on);

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  instagram_id text not null unique,
  type text not null check (type in ('Reel', 'Carousel', 'Photo', 'Video')),
  posted_at timestamptz,
  permalink text,
  caption text not null default '',
  hashtags text[] not null default '{}',
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists posts_profile_posted_idx on posts (profile_id, posted_at desc);

create table if not exists post_snapshots (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts (id) on delete cascade,
  captured_on date not null,
  captured_at timestamptz not null default now(),
  -- Null when Instagram hides the like count (common on paid partnerships).
  likes bigint check (likes >= 0),
  comments bigint not null check (comments >= 0),
  views bigint check (views >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint post_snapshots_one_per_day unique (post_id, captured_on)
);
