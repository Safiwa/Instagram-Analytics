import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveProfile } from "../src/core/data/adapter";
import { computeMetrics } from "../src/core/analytics/metrics";
import { clearPublicCache } from "../src/core/data/public";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const discoveryPayload = {
  business_discovery: {
    id: "17841400000000001",
    username: "live.test",
    name: "Live Test",
    biography: "Public bio",
    followers_count: 15000,
    follows_count: 300,
    media_count: 42,
    profile_picture_url: "https://example.com/avatar.jpg",
    website: "https://example.com",
    media: {
      data: [
        {
          id: "media-1",
          caption: "First post #signal",
          media_type: "IMAGE",
          like_count: 100,
          comments_count: 4,
          timestamp: "2026-11-01T10:00:00+0000",
          permalink: "https://www.instagram.com/p/media-1",
        },
        {
          id: "media-2",
          caption: "Second post",
          media_type: "VIDEO",
          media_product_type: "REELS",
          like_count: 200,
          comments_count: 10,
          timestamp: "2026-11-02T10:00:00+0000",
          view_count: 5000,
        },
      ],
    },
  },
};

describe("live Instagram adapter", () => {
  beforeEach(() => {
    clearPublicCache();
    vi.stubEnv("IG_ACCESS_TOKEN", "test-token");
    vi.stubEnv("IG_BUSINESS_ACCOUNT_ID", "17841400000000000");
    vi.stubEnv("IG_GRAPH_VERSION", "v27.0");
    vi.stubEnv("INSTAGRAM_PROXY_URL", "");
  });

  afterEach(() => {
    clearPublicCache();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("maps a Business Discovery response into a live profile", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(discoveryPayload));
    vi.stubGlobal("fetch", fetchMock);

    const resolution = await resolveProfile("@Live.Test");

    expect(resolution.status).toBe("found");
    if (resolution.status !== "found") {
      throw new Error("expected a live profile");
    }

    const { profile } = resolution;
    expect(profile.source).toBe("live");
    expect(profile.username).toBe("live.test");
    expect(profile.followers).toBe(15000);
    expect(profile.following).toBe(300);
    expect(profile.postsCount).toBe(42);
    expect(profile.audience).toBeUndefined();
    expect(profile.followerHistory).toEqual([]);
    expect(profile.recentPosts).toHaveLength(2);
    expect(profile.recentPosts[0].hashtags).toEqual(["#signal"]);
    expect(profile.recentPosts[1].type).toBe("Reel");
    expect(profile.recentPosts[1].viewCount).toBe(5000);

    const metrics = computeMetrics(profile);
    expect(metrics.engagementBasis).toBe("likes+comments");
    expect(metrics.avgSaves).toBeNull();
    expect(metrics.followerGrowthPct).not.toBeNull();
    expect(metrics.authenticityPct).not.toBeNull();
    expect(metrics.growthEstimated).toBe(true);
    expect(metrics.authenticityEstimated).toBe(true);
    expect(metrics.estimateConfidence).not.toBeNull();

    const requested = decodeURIComponent(String(fetchMock.mock.calls[0][0]));
    expect(requested).toContain("/v27.0/17841400000000000");
    expect(requested).toContain("business_discovery.username(live.test)");
    expect(requested).not.toContain("access_token");

    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect((options.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });

  it("enriches a live profile with the real public verification badge", async () => {
    const discovery = {
      business_discovery: {
        ...discoveryPayload.business_discovery,
        username: "verified.test",
      },
    };
    const identityHtml = `<!DOCTYPE html><html><body><script type="application/json" data-sjs>${JSON.stringify({
      require: [
        {
          __bbox: {
            result: {
              data: {
                xig_user_by_igid_v2: {
                  username: "verified.test",
                  full_name: "Verified Test",
                  is_verified: true,
                  follower_count: 15_000,
                  profile_pic_url: "https://example.com/public-avatar.jpg",
                },
              },
            },
          },
        },
      ],
    })}</script></body></html>`;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("graph.facebook.com")) {
        return jsonResponse(discovery);
      }
      if (url.includes("instagram.com/verified.test/")) {
        return new Response(identityHtml, {
          status: 200,
          headers: { "Content-Type": "text/html", "X-Instagram-Proxy": "ok" },
        });
      }
      return new Response("", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await resolveProfile("verified.test");
    expect(first.status).toBe("found");
    if (first.status !== "found") {
      throw new Error("expected a live profile");
    }
    expect(first.profile.isVerified).toBe(true);
    expect(first.profile.profilePictureUrl).toBe("https://example.com/public-avatar.jpg");

    // Both the live profile and the identity lookup are cached per handle.
    await resolveProfile("verified.test");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the real public verification snapshot when the bridge is offline", async () => {
    const discovery = {
      business_discovery: {
        ...discoveryPayload.business_discovery,
        username: "natgeo",
        name: "National Geographic",
      },
    };
    // Every non-Graph request is an offline bridge response.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("graph.facebook.com")) {
          return jsonResponse(discovery);
        }
        return new Response("", { status: 403 });
      }),
    );

    const resolution = await resolveProfile("natgeo");

    expect(resolution.status).toBe("found");
    if (resolution.status !== "found") {
      throw new Error("expected a live profile");
    }
    expect(resolution.profile.isVerified).toBe(true);
    expect(resolution.profile.profilePictureUrl).toBe("https://example.com/avatar.jpg");
  });

  it("maps an invalid token to an auth error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ error: { code: 190, message: "Invalid OAuth access token." } }, 400),
      ),
    );

    const resolution = await resolveProfile("token.failure");

    expect(resolution.status).toBe("error");
    if (resolution.status !== "error") {
      throw new Error("expected an auth error");
    }
    expect(resolution.message).toContain("invalid or expired");
  });

  it("maps a missing professional account to not_found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ error: { code: 100, message: "Unsupported get request." } }, 400),
      ),
    );

    const resolution = await resolveProfile("personal.account");

    expect(resolution.status).toBe("not_found");
    if (resolution.status !== "not_found") {
      throw new Error("expected a not_found result");
    }
    expect(resolution.message).toContain("Business or Creator");
  });

  it("falls back to the public reader when credentials are absent", async () => {
    vi.unstubAllEnvs();
    delete process.env.IG_ACCESS_TOKEN;
    delete process.env.IG_BUSINESS_ACCOUNT_ID;

    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const resolution = await resolveProfile("ghost.account");

    expect(resolution.status).toBe("not_found");
    if (resolution.status !== "not_found") {
      throw new Error("expected a public not-found result");
    }
    expect(resolution.message).toContain("No public Instagram profile");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("instagram.com/ghost.account/");
  });
});
