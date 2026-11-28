import type { ConnectedInsights } from "../data/types";
import type { AccountMetric, Demographics } from "../instagram/api";
import { decryptToken, encryptToken } from "../instagram/crypto";
import { log } from "../logging/logger";
import { getSql } from "./client";
import { markTracked } from "./snapshots";

// Data layer for creators who connected their own account. Every function is
// scoped to one connected account (by id, Instagram user id or username); the
// stored token is decrypted only inside this module's callers on the server.

export type ConnectedAccount = {
  id: string;
  igUserId: string;
  username: string;
  accountType: string | null;
  tokenExpiresAt: string;
  tokenRefreshedAt: string;
  connectedAt: string;
  lastSyncedAt: string | null;
  lastError: string | null;
};

export type ConnectedAccountWithToken = ConnectedAccount & { accessToken: string };

function iso(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === "string" && value ? new Date(value).toISOString() : null;
}

function toAccount(row: Record<string, unknown>): ConnectedAccount {
  return {
    id: String(row.id),
    igUserId: String(row.ig_user_id),
    username: String(row.username),
    accountType: typeof row.account_type === "string" ? row.account_type : null,
    tokenExpiresAt: iso(row.token_expires_at) ?? "",
    tokenRefreshedAt: iso(row.token_refreshed_at) ?? "",
    connectedAt: iso(row.connected_at) ?? "",
    lastSyncedAt: iso(row.last_synced_at),
    lastError: typeof row.last_error === "string" ? row.last_error : null,
  };
}

const ACCOUNT_COLUMNS = `id, ig_user_id, username, account_type, token_expires_at,
  token_refreshed_at, connected_at, last_synced_at, last_error`;

export async function saveConnectedAccount(input: {
  igUserId: string;
  username: string;
  accountType: string | null;
  accessToken: string;
  tokenExpiresAt: Date;
  scopes: string[];
  clientBusinessId?: string | null;
  metaUserId?: string | null;
}): Promise<ConnectedAccount> {
  const sql = getSql();
  if (!sql) {
    throw new Error("DATABASE_URL is not configured.");
  }
  const [row] = await sql(
    `insert into connected_accounts (
       ig_user_id, username, account_type, access_token_enc, token_expires_at, scopes,
       client_business_id, meta_user_id
     ) values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (ig_user_id) do update set
       username = excluded.username,
       account_type = excluded.account_type,
       access_token_enc = excluded.access_token_enc,
       token_expires_at = excluded.token_expires_at,
       token_refreshed_at = now(),
       scopes = excluded.scopes,
       client_business_id = excluded.client_business_id,
       meta_user_id = excluded.meta_user_id,
       last_error = null,
       updated_at = now()
     returning ${ACCOUNT_COLUMNS}`,
    [
      input.igUserId,
      input.username.toLowerCase(),
      input.accountType,
      encryptToken(input.accessToken),
      input.tokenExpiresAt.toISOString(),
      input.scopes,
      input.clientBusinessId ?? null,
      input.metaUserId ?? null,
    ],
  );
  // Connected creators are always in the daily collector's rotation.
  await markTracked([input.username]);
  return toAccount(row);
}

export async function getConnectedAccount(id: string): Promise<ConnectedAccount | null> {
  const sql = getSql();
  if (!sql || !/^[0-9a-f-]{36}$/i.test(id)) {
    return null;
  }
  const rows = await sql(`select ${ACCOUNT_COLUMNS} from connected_accounts where id = $1`, [id]);
  return rows[0] ? toAccount(rows[0]) : null;
}

export async function updateToken(id: string, accessToken: string, expiresAt: Date): Promise<void> {
  const sql = getSql();
  if (!sql) {
    return;
  }
  await sql(
    `update connected_accounts set access_token_enc = $2, token_expires_at = $3,
       token_refreshed_at = now(), updated_at = now() where id = $1`,
    [id, encryptToken(accessToken), expiresAt.toISOString()],
  );
}

export async function markSynced(id: string, error: string | null): Promise<void> {
  const sql = getSql();
  if (!sql) {
    return;
  }
  await sql(
    error === null
      ? `update connected_accounts set last_synced_at = now(), last_error = null, updated_at = now() where id = $1`
      : `update connected_accounts set last_error = $2, updated_at = now() where id = $1`,
    error === null ? [id] : [id, error.slice(0, 300)],
  );
}

export async function storeAccountInsights(input: {
  accountId: string;
  day: string;
  followers: number | null;
  metrics: Record<AccountMetric, number | null>;
  demographics: Demographics;
}): Promise<void> {
  const sql = getSql();
  if (!sql) {
    return;
  }
  await sql(
    `insert into account_insights (connected_account_id, captured_on, followers, metrics, demographics)
     values ($1, $2::date, $3, $4::jsonb, $5::jsonb)
     on conflict (connected_account_id, captured_on) do update set
       captured_at = now(), followers = excluded.followers, metrics = excluded.metrics,
       demographics = excluded.demographics, updated_at = now()`,
    [input.accountId, input.day, input.followers, JSON.stringify(input.metrics), JSON.stringify(input.demographics)],
  );
}

// Accounts whose insights were not synced today, with their decrypted token.
// Expired tokens are skipped: the creator has to reconnect.
export async function listAccountsDueForSync(limit: number, now = new Date()): Promise<ConnectedAccountWithToken[]> {
  const sql = getSql();
  if (!sql) {
    return [];
  }
  const rows = await sql(
    `select ${ACCOUNT_COLUMNS}, access_token_enc from connected_accounts
     where token_expires_at > $1
       and (last_synced_at is null or last_synced_at < $2::date)
     order by last_synced_at asc nulls first
     limit $3`,
    [now.toISOString(), now.toISOString().slice(0, 10), limit],
  );
  const accounts: ConnectedAccountWithToken[] = [];
  for (const row of rows) {
    try {
      accounts.push({ ...toAccount(row), accessToken: decryptToken(String(row.access_token_enc)) });
    } catch (error) {
      log.warn("connected token unreadable", {
        account: String(row.id),
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }
  return accounts;
}

// Deletes by our id (disconnect) or by a Meta id from a deauthorize/data
// deletion callback, which may be the Instagram account id or the
// integration's app-scoped id. Returns the usernames removed.
export async function deleteConnectedAccount(where: { id?: string; metaId?: string }): Promise<string[]> {
  const sql = getSql();
  if (!sql || (!where.id && !where.metaId)) {
    return [];
  }
  const rows = where.id
    ? await sql(`delete from connected_accounts where id = $1 returning username`, [where.id])
    : await sql(
        `delete from connected_accounts where ig_user_id = $1 or meta_user_id = $1 returning username`,
        [where.metaId],
      );
  return rows.map((row) => String(row.username));
}

export type StoredConnectedInsights = {
  insights: ConnectedInsights;
  demographics: Demographics;
};

function metricValue(metrics: Record<string, unknown>, key: AccountMetric): number | null {
  const value = metrics[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// Latest shared insights for a handle, if its owner has connected it.
export async function loadConnectedInsights(username: string): Promise<StoredConnectedInsights | null> {
  const sql = getSql();
  if (!sql) {
    return null;
  }
  try {
    const rows = await sql(
      `select i.captured_on::text as captured_on, i.metrics, i.demographics, c.connected_at
       from connected_accounts c
       join account_insights i on i.connected_account_id = c.id
       where c.username = $1
       order by i.captured_on desc
       limit 1`,
      [username.trim().replace(/^@/, "").toLowerCase()],
    );
    const row = rows[0];
    if (!row || typeof row.captured_on !== "string") {
      return null;
    }
    const metrics = (typeof row.metrics === "string" ? JSON.parse(row.metrics) : row.metrics) ?? {};
    const demographics = (typeof row.demographics === "string" ? JSON.parse(row.demographics) : row.demographics) ?? {};
    return {
      insights: {
        capturedOn: row.captured_on,
        connectedSince: (iso(row.connected_at) ?? "").slice(0, 10),
        windowDays: 28,
        reach: metricValue(metrics, "reach"),
        views: metricValue(metrics, "views"),
        accountsEngaged: metricValue(metrics, "accounts_engaged"),
        totalInteractions: metricValue(metrics, "total_interactions"),
        saves: metricValue(metrics, "saves"),
        shares: metricValue(metrics, "shares"),
      },
      demographics: demographics as Demographics,
    };
  } catch (error) {
    log.warn("connected insights read failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

// Admin-facing opt-in list. It deliberately selects no token or private
// audience data. Country comes only from the manually recorded "Account based
// in" value; a missing row and an explicit "not published" value stay distinct.
export type ConnectedProfileForAdmin = {
  id: string;
  username: string;
  accountType: string | null;
  connectedAt: string;
  lastSyncedAt: string | null;
  country: string | null;
  countryStatus: "recorded" | "not-published" | "not-recorded";
};

export type ConnectedCountryCount = { country: string; count: number };

export type ConnectedProfilesForAdmin = {
  total: number;
  countries: ConnectedCountryCount[];
  profiles: ConnectedProfileForAdmin[];
};

export async function listConnectedProfilesForAdmin(): Promise<ConnectedProfilesForAdmin> {
  const sql = getSql();
  if (!sql) {
    return { total: 0, countries: [], profiles: [] };
  }
  const rows = await sql(
    `select c.id, c.username, c.account_type, c.connected_at, c.last_synced_at,
            l.country, l.recorded_at as country_recorded_at
     from connected_accounts c
     left join account_locations l on l.username = c.username
     order by c.connected_at desc, c.username asc`,
    [],
  );
  const profiles = rows.map((row): ConnectedProfileForAdmin => ({
    id: String(row.id),
    username: String(row.username),
    accountType: typeof row.account_type === "string" ? row.account_type : null,
    connectedAt: iso(row.connected_at) ?? "",
    lastSyncedAt: iso(row.last_synced_at),
    country: typeof row.country === "string" && row.country ? row.country : null,
    countryStatus: row.country_recorded_at
      ? typeof row.country === "string" && row.country
        ? "recorded"
        : "not-published"
      : "not-recorded",
  }));
  const counts = new Map<string, number>();
  for (const profile of profiles) {
    const label =
      profile.country ??
      (profile.countryStatus === "not-published" ? "Not published" : "Not recorded");
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const countries = [...counts.entries()]
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));
  return { total: profiles.length, countries, profiles };
}
