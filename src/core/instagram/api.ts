// Business Login for Instagram and the Instagram API with Instagram Login.
// Docs: developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login
// Every call is server-side; tokens never reach the browser or the logs.

export const CONNECT_SCOPES = ["instagram_business_basic", "instagram_business_manage_insights"] as const;
const DEFAULT_REDIRECT = "https://www.instagram-analytics.com/api/instagram/callback";
const TIMEOUT_MS = 10_000;

export type ConnectConfig = { appId: string; appSecret: string; redirectUri: string };

export class InstagramApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
  ) {
    super(message);
    this.name = "InstagramApiError";
  }
}

export function connectConfig(): ConnectConfig | null {
  const appId = process.env.INSTAGRAM_APP_ID?.trim();
  const appSecret = process.env.INSTAGRAM_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    return null;
  }
  return { appId, appSecret, redirectUri: process.env.INSTAGRAM_REDIRECT_URI?.trim() || DEFAULT_REDIRECT };
}

function graphVersion(): string {
  return process.env.IG_GRAPH_VERSION?.trim() || "v27.0";
}

export function authorizeUrl(config: ConnectConfig, state: string): string {
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", CONNECT_SCOPES.join(","));
  url.searchParams.set("enable_fb_login", "false");
  url.searchParams.set("state", state);
  return url.toString();
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const error = data.error as { message?: string; code?: number } | string | undefined;
  if (!response.ok || error) {
    const message =
      typeof error === "object" && error?.message
        ? error.message
        : typeof data.error_message === "string"
          ? data.error_message
          : `Instagram API request failed (${response.status}).`;
    throw new InstagramApiError(message, response.status, typeof error === "object" ? error?.code : undefined);
  }
  return data;
}

export type ShortLivedToken = { accessToken: string; userId: string; permissions: string[] };

export async function exchangeCode(config: ConnectConfig, code: string): Promise<ShortLivedToken> {
  const body = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
    code,
  });
  const data = await readJson(
    await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }),
  );
  // Documented as { data: [{ access_token, user_id, permissions }] }; older
  // responses were flat. Accept both.
  const entry = (Array.isArray(data.data) ? data.data[0] : data) as Record<string, unknown> | undefined;
  const accessToken = entry?.access_token;
  const userId = entry?.user_id;
  if (typeof accessToken !== "string" || (typeof userId !== "string" && typeof userId !== "number")) {
    throw new InstagramApiError("Instagram returned no access token.", 502);
  }
  const permissions = entry?.permissions;
  return {
    accessToken,
    userId: String(userId),
    permissions: Array.isArray(permissions)
      ? permissions.map(String)
      : typeof permissions === "string"
        ? permissions.split(",").map((value) => value.trim()).filter(Boolean)
        : [],
  };
}

export type LongLivedToken = { accessToken: string; expiresAt: Date };

function toLongLived(data: Record<string, unknown>, now: Date): LongLivedToken {
  const accessToken = data.access_token;
  const expiresIn = Number(data.expires_in);
  if (typeof accessToken !== "string" || !Number.isFinite(expiresIn)) {
    throw new InstagramApiError("Instagram returned no long-lived token.", 502);
  }
  return { accessToken, expiresAt: new Date(now.getTime() + expiresIn * 1000) };
}

// Short-lived → 60-day token (server-side only, needs the app secret).
export async function exchangeLongLived(
  config: ConnectConfig,
  shortToken: string,
  now = new Date(),
): Promise<LongLivedToken> {
  const url = new URL("https://graph.instagram.com/access_token");
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("access_token", shortToken);
  return toLongLived(await readJson(await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) })), now);
}

// Extends a long-lived token by another 60 days. Allowed once it is 24h old.
export async function refreshLongLived(token: string, now = new Date()): Promise<LongLivedToken> {
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", token);
  return toLongLived(await readJson(await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) })), now);
}

async function graphGet(path: string, token: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const url = new URL(`https://graph.instagram.com/${graphVersion()}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return readJson(
    await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }),
  );
}

export type InstagramMe = {
  userId: string;
  username: string;
  name: string | null;
  accountType: string | null;
  followers: number | null;
};

export async function fetchMe(token: string): Promise<InstagramMe> {
  const data = await graphGet("me", token, {
    fields: "user_id,username,name,account_type,followers_count",
  });
  const username = typeof data.username === "string" ? data.username.toLowerCase() : null;
  const userId = data.user_id ?? data.id;
  if (!username || (typeof userId !== "string" && typeof userId !== "number")) {
    throw new InstagramApiError("Instagram returned no account details.", 502);
  }
  const followers = Number(data.followers_count);
  return {
    userId: String(userId),
    username,
    name: typeof data.name === "string" ? data.name : null,
    accountType: typeof data.account_type === "string" ? data.account_type : null,
    followers: Number.isFinite(followers) ? followers : null,
  };
}

// --- Insights ---------------------------------------------------------------

export const ACCOUNT_METRICS = [
  "reach",
  "views",
  "accounts_engaged",
  "total_interactions",
  "likes",
  "comments",
  "saves",
  "shares",
] as const;
export type AccountMetric = (typeof ACCOUNT_METRICS)[number];

export const DEMOGRAPHIC_BREAKDOWNS = ["country", "age", "gender", "city"] as const;
export type DemographicBreakdown = (typeof DEMOGRAPHIC_BREAKDOWNS)[number];
export type DemographicSlice = { key: string; value: number };
export type Demographics = Partial<Record<DemographicBreakdown, DemographicSlice[]>>;

export const METRIC_WINDOW_DAYS = 28;

function totalValue(data: Record<string, unknown>): number | null {
  const first = (Array.isArray(data.data) ? data.data[0] : null) as Record<string, unknown> | null;
  const total = first?.total_value as { value?: unknown } | undefined;
  const value = Number(total?.value);
  return Number.isFinite(value) ? value : null;
}

export function parseBreakdown(data: Record<string, unknown>): DemographicSlice[] {
  const first = (Array.isArray(data.data) ? data.data[0] : null) as Record<string, unknown> | null;
  const breakdowns = (first?.total_value as { breakdowns?: unknown[] } | undefined)?.breakdowns;
  const results = (Array.isArray(breakdowns) ? (breakdowns[0] as { results?: unknown[] })?.results : null) ?? [];
  const slices: DemographicSlice[] = [];
  for (const result of results as { dimension_values?: unknown[]; value?: unknown }[]) {
    const values = Array.isArray(result.dimension_values) ? result.dimension_values : [];
    const key = values[values.length - 1];
    const value = Number(result.value);
    if (typeof key === "string" && Number.isFinite(value) && value > 0) {
      slices.push({ key, value });
    }
  }
  return slices.sort((a, b) => b.value - a.value);
}

// Account totals for the last 28 days. Each metric is requested on its own so
// one unavailable metric (e.g. "views" while Meta lists it in development)
// cannot hide the others; unavailable metrics are null, never zero.
export async function fetchAccountMetrics(
  igUserId: string,
  token: string,
  now = new Date(),
): Promise<Record<AccountMetric, number | null>> {
  const until = Math.floor(now.getTime() / 1000);
  const since = until - METRIC_WINDOW_DAYS * 24 * 60 * 60;
  const settled = await Promise.allSettled(
    ACCOUNT_METRICS.map((metric) =>
      graphGet(`${igUserId}/insights`, token, {
        metric,
        period: "day",
        metric_type: "total_value",
        since: String(since),
        until: String(until),
      }),
    ),
  );
  const result = {} as Record<AccountMetric, number | null>;
  ACCOUNT_METRICS.forEach((metric, index) => {
    const outcome = settled[index];
    result[metric] = outcome.status === "fulfilled" ? totalValue(outcome.value) : null;
  });
  return result;
}

// Follower demographics (Meta requires 100+ followers; smaller accounts get none).
export async function fetchDemographics(igUserId: string, token: string): Promise<Demographics> {
  const settled = await Promise.allSettled(
    DEMOGRAPHIC_BREAKDOWNS.map((breakdown) =>
      graphGet(`${igUserId}/insights`, token, {
        metric: "follower_demographics",
        period: "lifetime",
        timeframe: "this_month",
        breakdown,
        metric_type: "total_value",
      }),
    ),
  );
  const demographics: Demographics = {};
  DEMOGRAPHIC_BREAKDOWNS.forEach((breakdown, index) => {
    const outcome = settled[index];
    if (outcome.status === "fulfilled") {
      const slices = parseBreakdown(outcome.value);
      if (slices.length > 0) {
        demographics[breakdown] = slices;
      }
    }
  });
  return demographics;
}
