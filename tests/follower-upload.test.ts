import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MIN_MODEL_FOLLOWERS, estimatePublicSignals } from "../src/core/analytics/estimates";
import { auditFollowers, type FollowerSample } from "../src/core/analytics/followerAudit";
import { computeMetrics, describeFakeFollowers } from "../src/core/analytics/metrics";
import { fetchFollowerSignals } from "../src/core/data/public";
import type { CreatorProfile, Post } from "../src/core/data/types";
import { setSqlRunnerForTests } from "../src/core/db/client";
import { saveConnectedAccount } from "../src/core/db/connected";
import { withStoredHistory } from "../src/core/db/enrich";
import {
  FOLLOWER_SAMPLE_LIMIT,
  followerUploadStatus,
  loadFollowerSample,
  parseFollowerExport,
  randomSample,
  saveFollowerUpload,
} from "../src/core/db/followerChecks";
import { signValue } from "../src/core/instagram/crypto";
import { runFollowerChecks } from "../src/core/instagram/followerCheckRunner";

let db: PGlite;

function post(id: string, likes = 4, comments = 1): Post {
  return { id, type: "Photo", caption: "", postedAt: new Date().toISOString(), likes, comments, hashtags: [] };
}

function profile(overrides: Partial<CreatorProfile> = {}): CreatorProfile {
  return {
    username: "campaignmastersagency",
    displayName: "Campaign Masters",
    category: "Marketing agency",
    bio: "",
    followers: 31,
    following: 20,
    postsCount: 12,
    isVerified: false,
    source: "live",
    followerHistory: [],
    recentPosts: [post("a"), post("b", 3, 1), post("c", 5, 0), post("d", 2, 2)],
    ...overrides,
  };
}

function realFollower(username: string): FollowerSample {
  return { username, posts: 40, followers: 300, following: 250, hasProfilePic: true, fullName: "present", bio: "present", isPrivate: false };
}

function exportJson(handles: string[]): string {
  return JSON.stringify(
    handles.map((handle) => ({
      title: "",
      media_list_data: [],
      string_list_data: [{ href: `https://www.instagram.com/${handle}`, value: handle, timestamp: 1_732_000_000 }],
    })),
  );
}

beforeAll(async () => {
  db = new PGlite();
  for (const file of ["0001_profile_snapshots.sql", "0002_connected_accounts.sql", "0003_unified_login.sql", "0004_follower_checks.sql"]) {
    await db.exec(await readFile(`db/migrations/${file}`, "utf8"));
  }
});

afterAll(async () => {
  setSqlRunnerForTests(undefined);
  await db.close();
});

beforeEach(async () => {
  vi.stubEnv("CONNECT_SECRET", "test-connect-secret-0123456789abcdef");
  await db.exec("truncate profiles, connected_accounts cascade");
  setSqlRunnerForTests(async (text, params = []) => (await db.query(text, params)).rows as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("small accounts", () => {
  it("does not model a fake-follower share under 1,000 followers", () => {
    const small = estimatePublicSignals(profile());
    expect(small.fakeFollowersPct).toBeNull();
    expect(small.fakeFollowersLowPct).toBeNull();
    expect(small.authenticityPct).toBeNull();
    expect(small.followerGrowthPct).not.toBeNull();

    const metrics = computeMetrics(profile());
    expect(metrics.fakeFollowerSource).toBeNull();
    expect(describeFakeFollowers(metrics)).toBe("—");

    const large = estimatePublicSignals(profile({ followers: MIN_MODEL_FOLLOWERS, recentPosts: [post("a", 60, 4), post("b", 70, 5)] }));
    expect(large.fakeFollowersPct).not.toBeNull();
  });
});

describe("census audit", () => {
  const all = Array.from({ length: 31 }, (_, index) => realFollower(`friend.${index}`));

  it("treats a check of (nearly) every follower as an exact count", () => {
    const audit = auditFollowers(all, 31)!;
    expect(audit).toMatchObject({ census: true, sampleSize: 31, fakeCount: 0, fakeSharePct: 0, lowPct: 0, highPct: 0 });
    expect(auditFollowers(all.slice(0, 30), 31)?.census).toBe(true);
    // Too few checked for a census and too few for a sample.
    expect(auditFollowers(all.slice(0, 20), 31)).toBeNull();
  });

  it("shows 0% as a measured result on the profile metrics", () => {
    const metrics = computeMetrics(profile({ followerSample: all }));
    expect(metrics.fakeFollowerSource).toBe("follower-audit");
    expect(metrics.authenticityPct).toBe(100);
    expect(metrics.authenticityEstimated).toBe(false);
    expect(describeFakeFollowers(metrics)).toBe("0% (0 of 31 flagged)");
  });

  it("still flags followers that break the site rules", () => {
    const withBot = [...all.slice(0, 30), { ...realFollower("sara83920174"), hasProfilePic: false }];
    const metrics = computeMetrics(profile({ followerSample: withBot }));
    expect(describeFakeFollowers(metrics)).toBe("3% (1 of 31 flagged)");
  });
});

describe("follower export parsing", () => {
  it("reads Instagram's JSON and HTML exports", () => {
    expect(parseFollowerExport(exportJson(["Nora.Creates", "ahmed_1994", "nora.creates"])).sort()).toEqual(["ahmed_1994", "nora.creates"]);
    const newer = JSON.stringify({ relationships_followers: [{ title: "lina.k", string_list_data: [{ timestamp: 1 }] }] });
    expect(parseFollowerExport(newer)).toEqual(["lina.k"]);
    const html = '<a target="_blank" href="https://www.instagram.com/omar.d">omar.d</a><a href="https://www.instagram.com/_u/zed_99">x</a><a href="https://www.instagram.com/accounts/login">y</a>';
    expect(parseFollowerExport(html).sort()).toEqual(["omar.d", "zed_99"]);
    expect(parseFollowerExport("nothing here")).toEqual([]);
  });

  it("samples without repeats", () => {
    const items = Array.from({ length: 1_000 }, (_, index) => index);
    const sample = randomSample(items, FOLLOWER_SAMPLE_LIMIT);
    expect(sample).toHaveLength(FOLLOWER_SAMPLE_LIMIT);
    expect(new Set(sample).size).toBe(FOLLOWER_SAMPLE_LIMIT);
    expect(randomSample([1, 2], 10)).toHaveLength(2);
  });
});

describe("public follower signals", () => {
  it("reads counts and the default avatar from a public profile page", async () => {
    vi.stubEnv("INSTAGRAM_PROXY_URL", "");
    const user = {
      username: "plain.user",
      full_name: "",
      biography: "",
      is_private: true,
      follower_count: 12,
      following_count: 80,
      media_count: 0,
      profile_pic_url: "https://cdn/44884218_345707102882519_2446069589734326272_n.jpg",
    };
    const page = `<html><head><meta property="og:title" content="(@plain.user)" /></head><body><script type="application/json" data-sjs>${JSON.stringify({ require: [{ __bbox: { result: { data: { xig_user_by_igid_v2: user } } } }] })}</script></body></html>`;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) =>
      String(input instanceof Request ? input.url : input).includes("/gone.user/")
        ? new Response("", { status: 404 })
        : new Response(page, { status: 200, headers: { "Content-Type": "text/html" } }),
    ));
    expect(await fetchFollowerSignals("plain.user")).toEqual({
      username: "plain.user", posts: 0, followers: 12, following: 80, hasProfilePic: false, hasName: false, hasBio: false, isPrivate: true,
    });
    expect(await fetchFollowerSignals("gone.user")).toBe("not_found");
  });
});

describe("follower upload flow", () => {
  async function connect() {
    return saveConnectedAccount({
      igUserId: "17841400000000009", username: "campaignmastersagency", accountType: "PROFESSIONAL",
      accessToken: "t", tokenExpiresAt: new Date(Date.now() + 86_400_000), scopes: [],
    });
  }

  it("stores the list, checks every follower and audits the profile at 0%", async () => {
    const account = await connect();
    const handles = Array.from({ length: 31 }, (_, index) => `friend.${index}`);
    expect(await saveFollowerUpload(account.id, handles)).toBe(31);

    let calls = 0;
    const run = await runFollowerChecks({
      budgetMs: 10_000,
      accountId: account.id,
      fetchSignals: async (username) => {
        calls += 1;
        if (username === "friend.30") {
          return calls < 5 ? null : "not_found";
        }
        return { username, posts: 30, followers: 200, following: 180, hasProfilePic: true, hasName: true, hasBio: true, isPrivate: false };
      },
    });
    expect(run.checked).toBe(30);

    const status = await followerUploadStatus(account.id);
    expect(status).toMatchObject({ inUpload: 31, sampled: 31, checked: 30 });

    // The unreadable follower is retried, then given up after 3 attempts.
    await runFollowerChecks({ budgetMs: 10_000, fetchSignals: async () => null });
    await runFollowerChecks({ budgetMs: 10_000, fetchSignals: async () => null });
    expect((await followerUploadStatus(account.id))?.unavailable).toBe(1);

    const sample = await loadFollowerSample("@CampaignMastersAgency");
    expect(sample).toHaveLength(30);
    const enriched = await withStoredHistory(profile());
    const metrics = computeMetrics(enriched);
    expect(metrics.followerAudit?.census).toBe(true);
    expect(describeFakeFollowers(metrics)).toBe("0% (0 of 30 flagged)");
    expect(metrics.authenticityPct).toBe(100);
  });

  it("replaces an earlier upload and deletes checks with the account", async () => {
    const account = await connect();
    await saveFollowerUpload(account.id, ["a.one", "b.two"]);
    await saveFollowerUpload(account.id, ["c.three"]);
    expect((await db.query("select username from follower_checks")).rows).toEqual([{ username: "c.three" }]);
    await db.query("delete from connected_accounts where id = $1", [account.id]);
    expect((await db.query("select * from follower_checks")).rows).toHaveLength(0);
  });

  it("accepts an upload only from the signed-in creator", async () => {
    vi.stubEnv("INSTAGRAM_PROXY_URL", "");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    const account = await connect();
    const { POST } = await import("../src/app/api/instagram/followers/route");
    const upload = (cookie: string | null, content: string) => {
      const form = new FormData();
      form.set("followers", new File([content], "followers_1.json", { type: "application/json" }));
      return POST(
        new NextRequest("https://www.instagram-analytics.com/api/instagram/followers", {
          method: "POST",
          body: form,
          headers: cookie ? { cookie } : {},
        }),
      );
    };

    const anonymous = await upload(null, exportJson(["x.y"]));
    expect(anonymous.headers.get("location")).toContain("error=expired");

    const cookie = `ig_session=${signValue(account.id, 600)}`;
    expect((await upload(cookie, "{}")).headers.get("location")).toContain("error=no-followers");
    const ok = await upload(cookie, exportJson(["one.friend", "two.friend", "campaignmastersagency"]));
    expect(ok.status).toBe(303);
    expect(ok.headers.get("location")).toContain("followers=uploaded");
    // The account itself is never audited as its own follower.
    expect((await db.query("select username from follower_checks order by username")).rows).toEqual([
      { username: "one.friend" },
      { username: "two.friend" },
    ]);
  });
});
