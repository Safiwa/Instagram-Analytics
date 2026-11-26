import { getSql } from "../db/client";
import { log } from "../logging/logger";
import type { SubscriptionEvent } from "./lemonsqueezy";
import type { PaidPlanId, SubscriptionState } from "./plans";

// Data layer for site accounts, subscriptions, metered lookups and tracked
// handles. Every function is scoped to one user id or one usage subject.

export type SiteUser = { id: string; email: string; lastLoginEmailAt: string | null };

export type StoredSubscription = SubscriptionState & {
  lsSubscriptionId: string;
  trialEndsAt: string | null;
  renewsAt: string | null;
  customerPortalUrl: string | null;
};

const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

function iso(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === "string" && value ? new Date(value).toISOString() : null;
}

function requireSql() {
  const sql = getSql();
  if (!sql) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return sql;
}

function toUser(row: Record<string, unknown>): SiteUser {
  return { id: String(row.id), email: String(row.email), lastLoginEmailAt: iso(row.last_login_email_at) };
}

export async function upsertUser(email: string): Promise<SiteUser> {
  const [row] = await requireSql()(
    `insert into site_users (email) values ($1)
     on conflict (email) do update set updated_at = now()
     returning id, email, last_login_email_at`,
    [email],
  );
  return toUser(row);
}

export async function getUser(id: string): Promise<SiteUser | null> {
  const sql = getSql();
  if (!sql) {
    return null;
  }
  const [row] = await sql("select id, email, last_login_email_at from site_users where id = $1", [id]);
  return row ? toUser(row) : null;
}

// One sign-in email per address per minute, so the form cannot be used to
// flood someone's inbox.
export const LOGIN_EMAIL_COOLDOWN_MS = 60_000;

export async function claimLoginEmailSlot(email: string, now = new Date()): Promise<boolean> {
  const rows = await requireSql()(
    `insert into site_users (email, last_login_email_at) values ($1, $2)
     on conflict (email) do update set last_login_email_at = excluded.last_login_email_at, updated_at = now()
     where site_users.last_login_email_at is null
        or site_users.last_login_email_at < $2::timestamptz - make_interval(secs => $3)
     returning id`,
    [email, now.toISOString(), LOGIN_EMAIL_COOLDOWN_MS / 1000],
  );
  return rows.length > 0;
}

function toSubscription(row: Record<string, unknown>): StoredSubscription {
  return {
    lsSubscriptionId: String(row.ls_subscription_id),
    plan: row.plan as PaidPlanId,
    status: String(row.status),
    trialEndsAt: iso(row.trial_ends_at),
    renewsAt: iso(row.renews_at),
    endsAt: iso(row.ends_at),
    customerPortalUrl: typeof row.customer_portal_url === "string" ? row.customer_portal_url : null,
  };
}

export async function listSubscriptions(userId: string): Promise<StoredSubscription[]> {
  const sql = getSql();
  if (!sql) {
    return [];
  }
  const rows = await sql(
    `select ls_subscription_id, plan, status, trial_ends_at, renews_at, ends_at, customer_portal_url
     from subscriptions where user_id = $1 order by updated_at desc`,
    [userId],
  );
  return rows.map(toSubscription);
}

// Applies one webhook. The owner is the user id passed through checkout
// custom data; failing that, the checkout email (creating the account).
export async function applySubscriptionEvent(event: SubscriptionEvent, plan: PaidPlanId): Promise<boolean> {
  const sql = requireSql();
  let userId = event.userId;
  if (userId) {
    const [exists] = await sql("select id from site_users where id = $1", [userId]);
    if (!exists) {
      userId = null;
    }
  }
  if (!userId && event.email) {
    userId = (await upsertUser(event.email)).id;
  }
  if (!userId) {
    log.warn("subscription webhook without a matching account", { subscription: event.subscriptionId });
    return false;
  }

  await sql(
    `insert into subscriptions (
       user_id, ls_subscription_id, ls_customer_id, ls_variant_id, plan, status,
       trial_ends_at, renews_at, ends_at, customer_portal_url
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (ls_subscription_id) do update set
       ls_customer_id = excluded.ls_customer_id,
       ls_variant_id = excluded.ls_variant_id,
       plan = excluded.plan,
       status = excluded.status,
       trial_ends_at = excluded.trial_ends_at,
       renews_at = excluded.renews_at,
       ends_at = excluded.ends_at,
       customer_portal_url = coalesce(excluded.customer_portal_url, subscriptions.customer_portal_url),
       updated_at = now()`,
    [
      userId,
      event.subscriptionId,
      event.customerId,
      event.variantId,
      plan,
      event.status,
      event.trialEndsAt,
      event.renewsAt,
      event.endsAt,
      event.customerPortalUrl,
    ],
  );
  return true;
}

// ---- metered lookups ----

export async function countLookups(subject: string, period: string): Promise<number> {
  const sql = getSql();
  if (!sql) {
    return 0;
  }
  const [row] = await sql(
    "select count(*)::int as n from usage_lookups where subject = $1 and period = $2",
    [subject, period],
  );
  return Number(row?.n ?? 0);
}

export async function hasLookedUp(subject: string, period: string, username: string): Promise<boolean> {
  const sql = getSql();
  if (!sql) {
    return false;
  }
  const [row] = await sql(
    "select 1 from usage_lookups where subject = $1 and period = $2 and username = $3",
    [subject, period, username],
  );
  return Boolean(row);
}

export async function recordLookups(subject: string, period: string, usernames: readonly string[]): Promise<void> {
  const sql = getSql();
  const clean = [...new Set(usernames)].filter((name) => /^[a-z0-9._]{1,30}$/.test(name));
  if (!sql || clean.length === 0) {
    return;
  }
  await sql(
    `insert into usage_lookups (subject, period, username)
     select $1, $2, handle from unnest($3::text[]) as handle
     on conflict do nothing`,
    [subject, period, clean],
  );
}

// ---- tracked handles ----

export async function listTrackedHandles(userId: string): Promise<string[]> {
  const sql = getSql();
  if (!sql) {
    return [];
  }
  const rows = await sql(
    "select username from user_tracked_handles where user_id = $1 order by created_at asc",
    [userId],
  );
  return rows.map((row) => String(row.username));
}

// Adds a handle unless the plan's allowance is used up. Returns false when full.
export async function addTrackedHandle(userId: string, username: string, limit: number): Promise<boolean> {
  const rows = await requireSql()(
    `insert into user_tracked_handles (user_id, username)
     select $1, $2
     where (select count(*) from user_tracked_handles where user_id = $1) < $3
        or exists (select 1 from user_tracked_handles where user_id = $1 and username = $2)
     on conflict do nothing
     returning username`,
    [userId, username, limit],
  );
  if (rows.length > 0) {
    return true;
  }
  const [already] = await requireSql()(
    "select 1 from user_tracked_handles where user_id = $1 and username = $2",
    [userId, username],
  );
  return Boolean(already);
}

export async function removeTrackedHandle(userId: string, username: string): Promise<void> {
  await requireSql()("delete from user_tracked_handles where user_id = $1 and username = $2", [userId, username]);
}
