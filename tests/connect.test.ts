import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreatorProfile } from "../src/core/data/types";
import { setSqlRunnerForTests } from "../src/core/db/client";
import {
  getConnectedAccount,
  listAccountsDueForSync,
  loadConnectedInsights,
  saveConnectedAccount,
} from "../src/core/db/connected";
import { withStoredHistory } from "../src/core/db/enrich";
import {
  authorizeUrl,
  CONFIG_PERMISSIONS,
  exchangeCode,
  fetchAccountMetrics,
  fetchConnectedClient,
  fetchDemographics,
  parseBreakdown,
} from "../src/core/instagram/api";
import { toAudience } from "../src/core/instagram/audience";
import {
  decryptToken,
  encryptToken,
  parseSignedRequest,
  signValue,
  verifySignedValue,
} from "../src/core/instagram/crypto";
import { syncConnectedAccount } from "../src/core/instagram/sync";

const SECRET = "test-connect-secret-0123456789abcdef";
const APP = {
  appId: "2724728307941311",
  appSecret: "app-secret",
  configId: "1141747911599517",
  redirectUri: "https://www.instagram-analytics.com/api/instagram/callback",
};
const IG_ID = "17841400000000001";

let db: PGlite;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function breakdown(key: string, results: [string, number][]) {
  return {
    data: [
      {
        name: "follower_demographics",
        period: "lifetime",
        total_value: {
          breakdowns: [
            {
              dimension_keys: ["timeframe", key],
              results: results.map(([value, count]) => ({ dimension_values: ["THIS_MONTH", value], value: count })),
            },
          ],
        },
      },
    ],
  };
}

// A fake graph.facebook.com that answers the calls the connect flow makes.
function fakeGraph(calls: string[]) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const path = url.pathname.replace(/^\/v\d+\.\d+\//, "/");
    calls.push(`${url.hostname}${path}${url.searchParams.get("metric") ? `?${url.searchParams.get("metric")}` : ""}`);
    if (path === "/oauth/access_token") {
      return json({ access_token: "suat-token", token_type: "bearer" });
    }
    if (path === "/me") {
      return json({ client_business_id: "2392208661547210", id: "122100000000000001" });
    }
    if (path === "/me/assigned_instagram_accounts") {
      return json({ data: [{ id: IG_ID, username: "Nora.Creates" }] });
    }
    if (path === `/${IG_ID}`) {
      return json({ followers_count: 12_500, id: IG_ID });
    }
    const metric = url.searchParams.get("metric");
    if (metric === "follower_demographics") {
      const key = url.searchParams.get("breakdown")!;
      const data: Record<string, [string, number][]> = {
        country: [["AE", 600], ["SA", 300], ["IN", 100]],
        age: [["25-34", 500], ["18-24", 400], ["35-44", 100]],
        gender: [["F", 700], ["M", 250], ["U", 50]],
        city: [["Dubai, Dubai", 500]],
      };
      return json(breakdown(key, data[key] ?? []));
    }
    if (metric === "views") {
      return json({ error: { message: "metric in development", code: 100 } }, 400);
    }
    const values: Record<string, number> = {
      reach: 48_000, accounts_engaged: 3_200, total_interactions: 9_100, likes: 7_000, comments: 400, saves: 900, shares: 800,
    };
    return json({ data: [{ name: metric, period: "day", total_value: { value: values[metric ?? ""] ?? 0 } }] });
  });
}

beforeAll(async () => {
  db = new PGlite();
  for (const file of ["0001_profile_snapshots.sql", "0002_connected_accounts.sql", "0003_unified_login.sql"]) {
    await db.exec(await readFile(`db/migrations/${file}`, "utf8"));
  }
});

afterAll(async () => {
  setSqlRunnerForTests(undefined);
  await db.close();
});

beforeEach(async () => {
  vi.stubEnv("CONNECT_SECRET", SECRET);
  await db.exec("truncate profiles, connected_accounts cascade");
  setSqlRunnerForTests(async (text, params = []) => (await db.query(text, params)).rows as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("crypto helpers", () => {
  it("encrypts tokens so the database never holds them in plain text", () => {
    const sealed = encryptToken("IGAAtoken123");
    expect(sealed).not.toContain("IGAAtoken123");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(decryptToken(sealed)).toBe("IGAAtoken123");
    expect(() => decryptToken(sealed.replace(/.$/, (c) => (c === "A" ? "B" : "A")))).toThrow();
  });

  it("signs cookie values with expiry and rejects tampering", () => {
    const now = 1_000_000;
    const signed = signValue("abc", 60, now);
    expect(verifySignedValue(signed, now + 1_000)).toBe("abc");
    expect(verifySignedValue(signed, now + 61_000)).toBeNull();
    expect(verifySignedValue(signed.replace("abc", "abd"), now)).toBeNull();
    vi.stubEnv("CONNECT_SECRET", "");
    expect(verifySignedValue(signed, now)).toBeNull();
  });

  it("verifies Meta signed_request payloads with the app secret", () => {
    const payload = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "1784", issued_at: 1 })).toString("base64url");
    const signature = createHmac("sha256", "app-secret").update(payload).digest("base64url");
    expect(parseSignedRequest(`${signature}.${payload}`, "app-secret")?.user_id).toBe("1784");
    expect(parseSignedRequest(`${signature}.${payload}`, "other-secret")).toBeNull();
    expect(parseSignedRequest("garbage", "app-secret")).toBeNull();
  });
});

describe("Instagram API with Unified Login", () => {
  it("builds the same login URL Meta generates for the configuration", () => {
    const url = new URL(authorizeUrl(APP, "state123"));
    expect(url.origin + url.pathname).toBe("https://www.facebook.com/dialog/oauth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: APP.appId,
      config_id: APP.configId,
      redirect_uri: APP.redirectUri,
      response_type: "code",
      override_default_response_type: "true",
      state: "state123",
      prompt: "login",
    });
  });

  it("exchanges the code server-side and treats a missing expiry as non-expiring", async () => {
    const calls: string[] = [];
    const fetchMock = fakeGraph(calls);
    vi.stubGlobal("fetch", fetchMock);
    const now = new Date("2026-11-25T00:00:00Z");
    const token = await exchangeCode(APP, "code", now);
    expect(token.accessToken).toBe("suat-token");
    expect(token.expiresAt.getUTCFullYear()).toBeGreaterThan(2100);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.hostname).toBe("graph.facebook.com");
    expect(url.searchParams.get("client_secret")).toBe("app-secret");

    vi.stubGlobal("fetch", vi.fn(async () => json({ access_token: "t", expires_in: 3600 })));
    expect((await exchangeCode(APP, "code", now)).expiresAt.toISOString()).toBe("2026-11-25T01:00:00.000Z");
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { message: "Invalid verification code", code: 100 } }, 400)));
    await expect(exchangeCode(APP, "bad")).rejects.toThrow("Invalid verification code");
  });

  it("finds the business portfolio and the shared Instagram accounts", async () => {
    vi.stubGlobal("fetch", fakeGraph([]));
    expect(await fetchConnectedClient("suat-token")).toEqual({
      metaUserId: "122100000000000001",
      clientBusinessId: "2392208661547210",
      instagramAccounts: [{ id: IG_ID, username: "nora.creates" }],
    });
  });
});

describe("insights", () => {
  it("parses demographics and converts them to audience shares", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", fakeGraph(calls));
    const demographics = await fetchDemographics("1784", "token");
    expect(demographics.country?.[0]).toEqual({ key: "AE", value: 600 });

    const audience = toAudience(demographics)!;
    expect(audience.topCountries[0]).toEqual({ label: "United Arab Emirates", percentage: 60 });
    expect(audience.ageGroups.map((slice) => slice.label)).toEqual(["18-24", "25-34", "35-44"]);
    expect(audience.gender).toEqual([
      { label: "Female", percentage: 70 },
      { label: "Male", percentage: 25 },
      { label: "Unspecified", percentage: 5 },
    ]);
    expect(toAudience({})).toBeUndefined();
    expect(parseBreakdown({})).toEqual([]);
  });

  it("keeps a failed metric null instead of zero", async () => {
    vi.stubGlobal("fetch", fakeGraph([]));
    const metrics = await fetchAccountMetrics("1784", "token", new Date("2026-11-25T00:00:00Z"));
    expect(metrics.reach).toBe(48_000);
    expect(metrics.views).toBeNull();
    expect(metrics.saves).toBe(900);
  });
});

describe("connected accounts", () => {
  async function connect() {
    const account = await saveConnectedAccount({
      igUserId: IG_ID,
      username: "nora.creates",
      accountType: "PROFESSIONAL",
      accessToken: "suat-token",
      tokenExpiresAt: new Date(Date.now() + 50 * 365 * 24 * 3600 * 1000),
      scopes: [...CONFIG_PERMISSIONS],
      clientBusinessId: "2392208661547210",
      metaUserId: "122100000000000001",
    });
    return { ...account, accessToken: "suat-token" };
  }

  it("stores the token encrypted and adds the creator to the collector rotation", async () => {
    const account = await connect();
    const raw = await db.query<{ access_token_enc: string; client_business_id: string }>(
      "select access_token_enc, client_business_id from connected_accounts",
    );
    expect(raw.rows[0].access_token_enc).not.toContain("suat-token");
    expect(raw.rows[0].client_business_id).toBe("2392208661547210");
    expect((await getConnectedAccount(account.id))?.username).toBe("nora.creates");
    expect(await getConnectedAccount("not-a-uuid")).toBeNull();
    const tracked = await db.query<{ tracked: boolean }>("select tracked from profiles where username = 'nora.creates'");
    expect(tracked.rows[0].tracked).toBe(true);
  });

  it("syncs insights from graph.facebook.com and shows them on the profile", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", fakeGraph(calls));
    const account = await connect();
    expect(await syncConnectedAccount(account)).toBe(true);
    expect(calls.every((call) => call.startsWith("graph.facebook.com/"))).toBe(true);
    expect(calls).toContain(`graph.facebook.com/${IG_ID}/insights?reach`);

    const stored = await loadConnectedInsights("@Nora.Creates");
    expect(stored?.insights).toMatchObject({ reach: 48_000, views: null, saves: 900, shares: 800, windowDays: 28 });

    // Synced today: not due again until tomorrow.
    expect(await listAccountsDueForSync(10)).toEqual([]);

    const profile: CreatorProfile = {
      username: "nora.creates", displayName: "Nora", category: "Creator", bio: "", followers: 12_500, following: 1,
      postsCount: 1, isVerified: false, source: "live", followerHistory: [], recentPosts: [],
    };
    const enriched = await withStoredHistory(profile);
    expect(enriched.connectedInsights?.reach).toBe(48_000);
    expect(enriched.audience?.topCountries[0].label).toBe("United Arab Emirates");
  });

  it("records a revoked token as a reconnect message without throwing", async () => {
    const account = await connect();
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { message: "Error validating access token", code: 190 } }, 400)));
    expect(await syncConnectedAccount(account)).toBe(false);
    expect((await getConnectedAccount(account.id))?.lastError).toBe("Access was removed or expired. Please reconnect.");
  });
});

describe("routes", () => {
  beforeEach(() => {
    vi.stubEnv("META_APP_ID", APP.appId);
    vi.stubEnv("META_APP_SECRET", APP.appSecret);
    vi.stubEnv("INSTAGRAM_LOGIN_CONFIG_ID", APP.configId);
    vi.stubEnv("DATABASE_URL", "postgres://unused");
  });

  it("starts login with a signed state cookie", async () => {
    const { GET } = await import("../src/app/api/instagram/connect/route");
    const response = GET(new NextRequest("https://www.instagram-analytics.com/api/instagram/connect"));
    const location = new URL(response.headers.get("location")!);
    expect(location.hostname).toBe("www.facebook.com");
    expect(location.searchParams.get("config_id")).toBe(APP.configId);
    const state = location.searchParams.get("state")!;
    const cookie = response.cookies.get("ig_oauth_state")!;
    expect(cookie.httpOnly).toBe(true);
    expect(verifySignedValue(cookie.value)).toBe(state);
  });

  it("rejects a callback whose state does not match", async () => {
    const { GET } = await import("../src/app/api/instagram/callback/route");
    const response = await GET(
      new NextRequest("https://www.instagram-analytics.com/api/instagram/callback?code=abc&state=forged", {
        headers: { cookie: `ig_oauth_state=${signValue("real", 600)}` },
      }),
    );
    expect(response.headers.get("location")).toBe("https://www.instagram-analytics.com/connect?error=expired");
  });

  it("completes a full connection and sets a session cookie", async () => {
    vi.stubGlobal("fetch", fakeGraph([]));
    const { GET } = await import("../src/app/api/instagram/callback/route");
    const response = await GET(
      new NextRequest("https://www.instagram-analytics.com/api/instagram/callback?code=abc&state=real#_", {
        headers: { cookie: `ig_oauth_state=${signValue("real", 600)}` },
      }),
    );
    expect(response.headers.get("location")).toBe("https://www.instagram-analytics.com/connect?connected=1");
    const session = verifySignedValue(response.cookies.get("ig_session")!.value)!;
    expect((await getConnectedAccount(session))?.username).toBe("nora.creates");
    expect((await loadConnectedInsights("nora.creates"))?.insights.reach).toBe(48_000);
  });

  it("reports when no Instagram account was shared", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.pathname.endsWith("/oauth/access_token")) return json({ access_token: "t" });
      if (url.pathname.endsWith("/assigned_instagram_accounts")) return json({ data: [] });
      return json({ id: "1" });
    }));
    const { GET } = await import("../src/app/api/instagram/callback/route");
    const response = await GET(
      new NextRequest("https://www.instagram-analytics.com/api/instagram/callback?code=abc&state=real", {
        headers: { cookie: `ig_oauth_state=${signValue("real", 600)}` },
      }),
    );
    expect(response.headers.get("location")).toBe("https://www.instagram-analytics.com/connect?error=no-account");
  });

  it("deletes everything on disconnect and on Meta's deletion callback", async () => {
    const input = {
      igUserId: IG_ID, username: "nora.creates", accountType: "PROFESSIONAL", accessToken: "t",
      tokenExpiresAt: new Date(Date.now() + 86_400_000), scopes: [], metaUserId: "122100000000000001",
    };
    const account = await saveConnectedAccount(input);
    const { POST: disconnect } = await import("../src/app/api/instagram/disconnect/route");
    const response = await disconnect(
      new NextRequest("https://www.instagram-analytics.com/api/instagram/disconnect", {
        method: "POST",
        headers: { cookie: `ig_session=${signValue(account.id, 600)}` },
      }),
    );
    expect(response.status).toBe(303);
    expect(await getConnectedAccount(account.id)).toBeNull();

    // Meta's callbacks may identify the connection by the integration's
    // app-scoped id or by the Instagram account id; both delete it.
    for (const userId of ["122100000000000001", IG_ID]) {
      await saveConnectedAccount(input);
      const payload = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: userId, issued_at: 5 })).toString("base64url");
      const signature = createHmac("sha256", APP.appSecret).update(payload).digest("base64url");
      const { POST: deletion } = await import("../src/app/api/instagram/data-deletion/route");
      const result = await deletion(
        new Request("https://www.instagram-analytics.com/api/instagram/data-deletion", {
          method: "POST",
          body: new URLSearchParams({ signed_request: `${signature}.${payload}` }),
        }),
      );
      const data = (await result.json()) as { url: string; confirmation_code: string };
      expect(data.confirmation_code).toMatch(/^[a-f0-9]{16}$/);
      expect(data.url).toContain(`/privacy?deletion=${data.confirmation_code}`);
      expect((await db.query("select * from connected_accounts")).rows).toHaveLength(0);
    }

    const { POST: deletion } = await import("../src/app/api/instagram/data-deletion/route");
    const bad = await deletion(
      new Request("https://www.instagram-analytics.com/api/instagram/data-deletion", {
        method: "POST",
        body: new URLSearchParams({ signed_request: "x.y" }),
      }),
    );
    expect(bad.status).toBe(400);
  });
});
