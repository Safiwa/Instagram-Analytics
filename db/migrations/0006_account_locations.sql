-- "Account based in" values the site owner recorded from each profile's
-- "About this account" sheet. Instagram shows that value only to logged-in
-- viewers, so it is entered by hand on /admin/locations. A null country means
-- "not published" (the account is not based where its bio suggests).
create table if not exists account_locations (
  username text primary key check (username ~ '^[a-z0-9._]{1,30}$'),
  country text,
  recorded_at timestamptz not null default now()
);
