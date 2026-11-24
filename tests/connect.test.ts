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
  CONNECT_SCOPES,
  exchangeCode,
  fetchAccountMetrics,
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
const APP = { appId: "990602627938098", appSecret: "app-secret", redirectUri: "https://www.instagram-analytics.com/api/instagram/callback" };

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

// A fake graph.instagram.com that answers the calls the sync makes.
function fakeInstagram(calls: string[]) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    calls.push(`${url.hostname}${url.pathname}?${url.searchParams.get("metric") ?? url.searchParams.get("grant_type") ?? ""}${url.searchParams.get("breakdown") ? `:${url.searchParams.get("breakdown")}` : ""}`);
    if (url.pathname === "/refresh_access_token") {
      return json({ access_token: "refreshed-token", token_type: "bearer", expires_in: 5_183_944 });
    }
    if (url.pathname.endsWith("/me")) {
      return json({ user_id: "17841400000000001", username: "Nora.Creates", account_type: "MEDIA_CREATOR", followers_count: 12_500 });
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
  for (const file of ["0001_profile_snapshots.sql", "0002_connected_accounts.sql"]) {
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

describe("Business Login for Instagram", () => {
  it("builds the documented authorization URL", () => {
    const url = new URL(authorizeUrl(APP, "state123"));
    expect(url.origin + url.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe(APP.appId);
    expect(url.searchParams.get("redirect_uri")).toBe(APP.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe(CONNECT_SCOPES.join(","));
    expect(url.searchParams.get("state")).toBe("state123");
  });

  it("exchanges the code in both documented response shapes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: [{ access_token: "short", user_id: 1784, permissions: "instagram_business_basic,instagram_business_manage_insights" }] })));
    expect(await exchangeCode(APP, "code")).toEqual({
      accessToken: "short",
      userId: "1784",
      permissions: ["instagram_business_basic", "instagram_business_manage_insights"],
    });
    vi.stubGlobal("fetch", vi.fn(async () => json({ access_token: "short", user_id: "9", permissions: ["instagram_business_basic"] })));
    expect((await exchangeCode(APP, "code")).userId).toBe("9");
    vi.stubGlobal("fetch", vi.fn(async () => json({ error_type: "OAuthException", code: 400, error_message: "Invalid code" }, 400)));
    await expect(exchangeCode(APP, "bad")).rejects.toThrow("Invalid code");
  });
});

describe("insights", () => {
  it("parses demographics and converts them to audience shares", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", fakeInstagram(calls));
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
    vi.stubGlobal("fetch", fakeInstagram([]));
    const metrics = await fetchAccountMetrics("1784", "token", new Date("2026-11-25T00:00:00Z"));
    expect(metrics.reach).toBe(48_000);
    expect(metrics.views).toBeNull();
    expect(metrics.saves).toBe(900);
  });
});

describe("connected accounts", () => {
  async function connect(refreshedDaysAgo = 0) {
    const account = await saveConnectedAccount({
      igUserId: "17841400000000001",
      username: "nora.creates",
      accountType: "MEDIA_CREATOR",
      accessToken: "long-token",
      tokenExpiresAt: new Date(Date.now() + 50 * 24 * 3600 * 1000),
      scopes: [...CONNECT_SCOPES],
    });
    return { ...account, accessToken: "long-token", tokenRefreshedAt: new Date(Date.now() - refreshedDaysAgo * 24 * 3600 * 1000).toISOString() };
  }

  it("stores the token encrypted and adds the creator to the collector rotation", async () => {
    const account = await connect();
    const raw = await db.query<{ access_token_enc: string }>("select access_token_enc from connected_accounts");
    expect(raw.rows[0].access_token_enc).not.toContain("long-token");
    expect((await getConnectedAccount(account.id))?.username).toBe("nora.creates");
    expect(await getConnectedAccount("not-a-uuid")).toBeNull();
    const tracked = await db.query<{ tracked: boolean }>("select tracked from profiles where username = 'nora.creates'");
    expect(tracked.rows[0].tracked).toBe(true);
  });

  it("syncs insights, refreshing a week-old token first, and shows them on the profile", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", fakeInstagram(calls));
    const account = await connect(8);
    expect(await syncConnectedAccount(account)).toBe(true);
    expect(calls[0]).toBe("graph.instagram.com/refresh_access_token?ig_refresh_token");
    const sealed = await db.query<{ access_token_enc: string }>("select access_token_enc from connected_accounts");
    expect(decryptToken(sealed.rows[0].access_token_enc)).toBe("refreshed-token");

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

  it("does not refresh a recently refreshed token and records failures without throwing", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", fakeInstagram(calls));
    const account = await connect(1);
    await syncConnectedAccount(account);
    expect(calls.some((call) => call.includes("refresh_access_token"))).toBe(false);

    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { message: "Error validating access token", code: 190 } }, 400)));
    expect(await syncConnectedAccount({ ...account, tokenRefreshedAt: new Date().toISOString() })).toBe(false);
    expect((await getConnectedAccount(account.id))?.lastError).toContain("Error validating access token");
  });
});

describe("routes", () => {
  beforeEach(() => {
    vi.stubEnv("INSTAGRAM_APP_ID", APP.appId);
    vi.stubEnv("INSTAGRAM_APP_SECRET", APP.appSecret);
    vi.stubEnv("DATABASE_URL", "postgres://unused");
  });

  it("starts login with a signed state cookie", async () => {
    const { GET } = await import("../src/app/api/instagram/connect/route");
    const response = GET(new NextRequest("https://www.instagram-analytics.com/api/instagram/connect"));
    const location = new URL(response.headers.get("location")!);
    expect(location.hostname).toBe("www.instagram.com");
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
    const calls: string[] = [];
    const instagram = fakeInstagram(calls);
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.hostname === "api.instagram.com") {
        return json({ data: [{ access_token: "short", user_id: "17841400000000001", permissions: "instagram_business_basic,instagram_business_manage_insights" }] });
      }
      if (url.pathname === "/access_token") {
        return json({ access_token: "long-token", token_type: "bearer", expires_in: 5_183_944 });
      }
      return instagram(input);
    }));
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

  it("deletes everything on disconnect and on Meta's deletion callback", async () => {
    const account = await saveConnectedAccount({
      igUserId: "1784", username: "nora.creates", accountType: "MEDIA_CREATOR", accessToken: "t",
      tokenExpiresAt: new Date(Date.now() + 86_400_000), scopes: [],
    });
    const { POST: disconnect } = await import("../src/app/api/instagram/disconnect/route");
    const response = await disconnect(
      new NextRequest("https://www.instagram-analytics.com/api/instagram/disconnect", {
        method: "POST",
        headers: { cookie: `ig_session=${signValue(account.id, 600)}` },
      }),
    );
    expect(response.status).toBe(303);
    expect(await getConnectedAccount(account.id)).toBeNull();

    await saveConnectedAccount({
      igUserId: "1784", username: "nora.creates", accountType: "MEDIA_CREATOR", accessToken: "t",
      tokenExpiresAt: new Date(Date.now() + 86_400_000), scopes: [],
    });
    const payload = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "1784", issued_at: 5 })).toString("base64url");
    const signature = createHmac("sha256", APP.appSecret).update(payload).digest("base64url");
    const { POST: deletion } = await import("../src/app/api/instagram/data-deletion/route");
    const body = new URLSearchParams({ signed_request: `${signature}.${payload}` });
    const result = await deletion(
      new Request("https://www.instagram-analytics.com/api/instagram/data-deletion", { method: "POST", body }),
    );
    const data = (await result.json()) as { url: string; confirmation_code: string };
    expect(data.confirmation_code).toMatch(/^[a-f0-9]{16}$/);
    expect(data.url).toContain(`/privacy?deletion=${data.confirmation_code}`);
    expect((await db.query("select * from connected_accounts")).rows).toHaveLength(0);

    const bad = await deletion(
      new Request("https://www.instagram-analytics.com/api/instagram/data-deletion", {
        method: "POST",
        body: new URLSearchParams({ signed_request: "x.y" }),
      }),
    );
    expect(bad.status).toBe(400);
  });
});
