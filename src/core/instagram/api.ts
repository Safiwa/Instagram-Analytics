// Instagram API with Unified Login (Facebook Login for Business + an Instagram
// "Login Compatible" configuration). Creators log in with Instagram or Facebook,
// choose their business portfolio and Instagram professional account, and the
// app receives a Business Integration System User Access Token for that
// portfolio. Docs: developers.facebook.com/documentation/instagram-platform/
// instagram-api-with-unified-login. Every call is server-side; tokens never
// reach the browser or the logs.

// Permissions in the configuration (set in the App Dashboard, not by this code).
// instagram_manage_messages is required by Meta for this setup; this site never
// reads or sends messages.
export const CONFIG_PERMISSIONS = [
  "instagram_basic",
  "instagram_manage_insights",
  "instagram_manage_messages",
] as const;

const DEFAULT_REDIRECT = "https://www.instagram-analytics.com/api/instagram/callback";
const TIMEOUT_MS = 10_000;
// System-user tokens from this configuration never expire. When Meta does not
// return expires_in, the stored expiry is set far in the future.
const NON_EXPIRING_MS = 100 * 365 * 24 * 60 * 60 * 1000;

export type ConnectConfig = {
  appId: string;
  appSecret: string;
  configId: string;
  redirectUri: string;
};

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
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  const configId = process.env.INSTAGRAM_LOGIN_CONFIG_ID?.trim();
  if (!appId || !appSecret || !configId) {
    return null;
  }
  return {
    appId,
    appSecret,
    configId,
    redirectUri: process.env.INSTAGRAM_REDIRECT_URI?.trim() || DEFAULT_REDIRECT,
  };
}

function graphVersion(): string {
  return process.env.IG_GRAPH_VERSION?.trim() || "v27.0";
}

function graphUrl(path: string): URL {
  return new URL(`https://graph.facebook.com/${graphVersion()}/${path}`);
}

// Same format as the Login URL Meta generates for the configuration.
export function authorizeUrl(config: ConnectConfig, state: string): string {
  const url = new URL("https://www.facebook.com/dialog/oauth");
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("config_id", config.configId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("override_default_response_type", "true");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "login");
  return url.toString();
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const error = data.error as { message?: string; code?: number } | undefined;
  if (!response.ok || error) {
    throw new InstagramApiError(
      error?.message ?? `Meta API request failed (${response.status}).`,
      response.status,
      error?.code,
    );
  }
  return data;
}

async function graphGet(path: string, token: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const url = graphUrl(path);
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

export type AccessToken = { accessToken: string; expiresAt: Date };

// Server-to-server code exchange with the Meta app ID and secret.
export async function exchangeCode(config: ConnectConfig, code: string, now = new Date()): Promise<AccessToken> {
  const url = graphUrl("oauth/access_token");
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("code", code);
  const data = await readJson(await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) }));
  const accessToken = data.access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new InstagramApiError("Meta returned no access token.", 502);
  }
  const expiresIn = Number(data.expires_in);
  return {
    accessToken,
    expiresAt: new Date(now.getTime() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : NON_EXPIRING_MS)),
  };
}

export type ConnectedClient = {
  // App-scoped id of the business integration system user (Meta's callbacks
  // may identify the connection by it).
  metaUserId: string;
  clientBusinessId: string | null;
  instagramAccounts: { id: string; username: string }[];
};

// With a system-user token /me is the integration, not the Instagram account:
// the shared Instagram accounts come from /me/assigned_instagram_accounts.
export async function fetchConnectedClient(token: string): Promise<ConnectedClient> {
  const [me, assigned] = await Promise.all([
    graphGet("me", token, { fields: "client_business_id" }),
    graphGet("me/assigned_instagram_accounts", token, { fields: "id,username" }),
  ]);
  const metaUserId = me.id;
  if (typeof metaUserId !== "string" && typeof metaUserId !== "number") {
    throw new InstagramApiError("Meta returned no account details.", 502);
  }
  const accounts: { id: string; username: string }[] = [];
  for (const item of Array.isArray(assigned.data) ? assigned.data : []) {
    const entry = item as { id?: unknown; username?: unknown };
    if ((typeof entry.id === "string" || typeof entry.id === "number") && typeof entry.username === "string") {
      accounts.push({ id: String(entry.id), username: entry.username.toLowerCase() });
    }
  }
  return {
    metaUserId: String(metaUserId),
    clientBusinessId: typeof me.client_business_id === "string" ? me.client_business_id : null,
    instagramAccounts: accounts,
  };
}

export async function fetchFollowers(igAccountId: string, token: string): Promise<number | null> {
  const data = await graphGet(igAccountId, token, { fields: "followers_count" });
  const followers = Number(data.followers_count);
  return Number.isFinite(followers) ? followers : null;
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
// one unavailable metric cannot hide the others; unavailable metrics are null,
// never zero.
export async function fetchAccountMetrics(
  igAccountId: string,
  token: string,
  now = new Date(),
): Promise<Record<AccountMetric, number | null>> {
  const until = Math.floor(now.getTime() / 1000);
  const since = until - METRIC_WINDOW_DAYS * 24 * 60 * 60;
  const settled = await Promise.allSettled(
    ACCOUNT_METRICS.map((metric) =>
      graphGet(`${igAccountId}/insights`, token, {
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
export async function fetchDemographics(igAccountId: string, token: string): Promise<Demographics> {
  const settled = await Promise.allSettled(
    DEMOGRAPHIC_BREAKDOWNS.map((breakdown) =>
      graphGet(`${igAccountId}/insights`, token, {
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
