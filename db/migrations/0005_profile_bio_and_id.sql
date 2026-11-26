-- Peer matching needs the public biography (category and country signals) and
-- Instagram's numeric account id (an estimated join date) for profiles rebuilt
-- from the in-house index. Both are public profile fields; nothing private.
alter table profiles add column if not exists bio text;
alter table profiles add column if not exists instagram_id text
  check (instagram_id is null or instagram_id ~ '^[0-9]{1,25}$');
