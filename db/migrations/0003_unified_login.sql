-- Meta retired "API setup with Instagram login" for newer apps; connections use
-- the Instagram API with Unified Login instead. Its token is a Business
-- Integration System User Access Token for the creator's business portfolio,
-- so each connection also records that portfolio and the integration's
-- app-scoped id (Meta's deauthorize/data-deletion callbacks may use it).
-- ig_user_id now holds the Instagram professional account id.

alter table connected_accounts add column if not exists client_business_id text;
alter table connected_accounts add column if not exists meta_user_id text;

create index if not exists connected_accounts_meta_user_idx on connected_accounts (meta_user_id);
