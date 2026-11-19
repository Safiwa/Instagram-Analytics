import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeMetrics } from "../src/core/analytics/metrics";
import { resolveProfile } from "../src/core/data/adapter";
import {
  clearPublicCache,
  fetchPublicProfile,
  postedAtFromPk,
  shortcodeFromPk,
} from "../src/core/data/public";

type MediaFixture = {
  pk: string;
  mediaType: number;
  productType?: string;
  caption?: string;
  pinned?: boolean;
  likes?: number;
  comments?: number;
};

type ProfileFixture = {
  username: string;
  fullName?: string;
  followers?: number;
  following?: number;
  posts?: number;
  isPrivate?: boolean;
  isVerified?: boolean;
  media?: MediaFixture[];
};

const RECENT_REEL: MediaFixture = {
  pk: "4033038341586285853",
  mediaType: 2,
  productType: "clips",
  caption: "First reel #signal",
};

const RECENT_PHOTO: MediaFixture = {
  pk: "4031892735966066362",
  mediaType: 1,
  productType: "feed",
  caption: "Second photo",
};

const PINNED_CAROUSEL: MediaFixture = {
  pk: "4028698441835361298",
  mediaType: 8,
  productType: "carousel_container",
  caption: "Pinned carousel",
  pinned: true,
};

function profileHtml(fixture: ProfileFixture): string {
  const media = fixture.media ?? [];
  const followers = fixture.followers ?? 59057;
  const following = fixture.following ?? 8605;
  const posts = fixture.posts ?? 453;

  const payload = {
    require: [
      {
        __bbox: {
          result: {
            data: {
              xig_user_by_igid_v2: {
                username: fixture.username,
                full_name: fixture.fullName ?? "Public Test",
                biography: "Public bio #signal",
                is_verified: fixture.isVerified ?? true,
                is_private: fixture.isPrivate ?? false,
                follower_count: followers,
                following_count: following,
                profile_pic_url: "https://example.com/avatar.jpg",
              },
              polaris_timeline_connection: {
                edges: media.map((item) => ({
                  node: {
                    pk: item.pk,
                    is_timeline_pinned: item.pinned ?? false,
                    media_type: item.mediaType,
                    product_type: item.productType,
                    caption: { text: item.caption ?? "Caption" },
                    ...(item.likes === undefined ? {} : { edge_liked_by: { count: item.likes } }),
                    ...(item.comments === undefined
                      ? {}
                      : { edge_media_to_comment: { count: item.comments } }),
                  },
                })),
              },
            },
          },
        },
      },
    ],
  };

  const description = `${followers.toLocaleString("en-US")} Followers, ${following.toLocaleString(
    "en-US",
  )} Following, ${posts} Posts - See Instagram photos and videos`;

  return [
    "<!DOCTYPE html><html><head>",
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:title" content="${fixture.fullName ?? "Public Test"} (@${fixture.username}) • Instagram photos and videos" />`,
    "</head><body>",
    `<script type="application/json" data-sjs>${JSON.stringify(payload)}</script>`,
    "</body></html>",
  ].join("");
}

function embedHtml(likes: number, comments: number, views?: number): string {
  const payload = `{\\"edge_media_to_comment\\":{\\"count\\":${comments}},\\"edge_liked_by\\":{\\"count\\":${likes}}${
    views === undefined ? "" : `,\\"video_view_count\\":${views}`
  }}`;

  return `<html><body><script>window.__data = ${payload};</script></body></html>`;
}

function htmlResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { "Content-Type": "text/html" } });
}

function webProfileJson(fixture: ProfileFixture): Response {
  const followers = fixture.followers ?? 59057;
  const following = fixture.following ?? 8605;
  const media = (fixture.media ?? []).map((item) => ({
    pk: item.pk,
    shortcode: shortcodeFromPk(item.pk),
    taken_at_timestamp: 1760000000,
    media_type: item.mediaType,
    product_type: item.productType,
    edge_media_to_caption: { edges: [{ node: { text: item.caption ?? "Caption" } }] },
    edge_liked_by: { count: 420 },
    edge_media_to_comment: { count: 33 },
    video_view_count: item.mediaType === 2 ? 9000 : undefined,
  }));

  return new Response(
    JSON.stringify({
      data: {
        user: {
          username: fixture.username,
          full_name: fixture.fullName ?? "Web Profile Test",
          biography: "Fallback bio",
          is_verified: fixture.isVerified ?? false,
          is_private: fixture.isPrivate ?? false,
          edge_followed_by: { count: followers },
          edge_follow: { count: following },
          edge_owner_to_timeline_media: {
            count: fixture.posts ?? 100,
            edges: media.map((node) => ({ node })),
          },
        },
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function installFetch(fixture: ProfileFixture, embeds: Record<string, Response>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === `https://www.instagram.com/${fixture.username}/`) {
      return htmlResponse(profileHtml(fixture));
    }

    const embed = url.match(/\/p\/([^/]+)\/embed\/captioned\/$/);
    if (embed && embeds[embed[1]]) {
      return embeds[embed[1]];
    }

    return new Response("", { status: 404 });
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("public Instagram reader", () => {
  beforeEach(() => {
    clearPublicCache();
    vi.stubEnv("IG_ACCESS_TOKEN", "");
    vi.stubEnv("IG_BUSINESS_ACCOUNT_ID", "");
    vi.stubEnv("SCRAPINGBEE_API_KEY", "");
  });

  afterEach(() => {
    clearPublicCache();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("derives shortcodes and timestamps from media ids", () => {
    expect(shortcodeFromPk("4033038341586285853")).toBe("Df4OwDzx_Ud");
    expect(shortcodeFromPk("4031892735966066362")).toBe("Df0KRTbvDa6");
    expect(postedAtFromPk("4033038341586285853")).toBe("2026-11-18T09:54:17.152Z");
  });

  it("maps a public profile and its recent posts", async () => {
    const fetchMock = installFetch(
      {
        username: "public.test",
        fullName: "Public Test",
        media: [RECENT_REEL, RECENT_PHOTO, PINNED_CAROUSEL],
      },
      {
        Df4OwDzx_Ud: htmlResponse(embedHtml(318, 28, 6984)),
        Df0KRTbvDa6: htmlResponse(embedHtml(486, 62)),
      },
    );

    const resolution = await resolveProfile("@Public.Test");

    expect(resolution.status).toBe("found");
    if (resolution.status !== "found") {
      throw new Error("expected a public profile");
    }

    const { profile } = resolution;
    expect(profile.source).toBe("public");
    expect(profile.username).toBe("public.test");
    expect(profile.displayName).toBe("Public Test");
    expect(profile.followers).toBe(59057);
    expect(profile.following).toBe(8605);
    expect(profile.postsCount).toBe(453);
    expect(profile.isVerified).toBe(true);
    expect(profile.isPrivate).toBe(false);
    expect(profile.followerHistory).toEqual([]);
    expect(profile.audience).toBeUndefined();

    // The pinned carousel is skipped, so only two embeds are requested.
    expect(profile.recentPosts).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [reel, photo] = profile.recentPosts;
    expect(reel).toMatchObject({
      id: "Df4OwDzx_Ud",
      type: "Reel",
      likes: 318,
      comments: 28,
      viewCount: 6984,
      postedAt: "2026-11-18T09:54:17.152Z",
      hashtags: ["#signal"],
    });
    expect(reel.permalink).toBe("https://www.instagram.com/p/Df4OwDzx_Ud/");
    expect(photo).toMatchObject({
      id: "Df0KRTbvDa6",
      type: "Photo",
      likes: 486,
      comments: 62,
    });
    expect(photo.viewCount).toBeUndefined();

    const metrics = computeMetrics(profile);
    expect(metrics.engagementBasis).toBe("likes+comments");
    expect(metrics.engagementRate).toBe(0.76);
    expect(metrics.avgSaves).toBeNull();
    expect(metrics.followerGrowthPct).not.toBeNull();
    expect(metrics.authenticityPct).not.toBeNull();
    expect(metrics.growthEstimated).toBe(true);
    expect(metrics.authenticityEstimated).toBe(true);
    expect(metrics.estimateConfidence).not.toBeNull();
    expect(metrics.fakeFollowers).toBeGreaterThan(0);
    expect(metrics.fakeFollowers).toBeLessThan(profile.followers);
    expect(metrics.estimateMethodology).toContain("estimates, not measurements");
  });

  it("falls back to the web profile endpoint when crawler pages have no posts", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://www.instagram.com/web.fallback/") {
        return htmlResponse(profileHtml({ username: "web.fallback", media: [] }));
      }
      if (url.includes("web_profile_info")) {
        return webProfileJson({
          username: "web.fallback",
          fullName: "Web Fallback",
          media: [RECENT_REEL],
        });
      }
      return new Response("", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const profile = await fetchPublicProfile("web.fallback");

    expect(profile.displayName).toBe("Public Test");
    expect(profile.followers).toBe(59057);
    expect(profile.bio).toBe("Public bio #signal");
    expect(profile.recentPosts).toHaveLength(1);
    expect(profile.recentPosts[0]).toMatchObject({
      id: "Df4OwDzx_Ud",
      caption: "First reel #signal",
      likes: 420,
      comments: 33,
      viewCount: 9000,
    });
    // Inline engagement avoids any post-embed requests.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps a zero-post profile when no public source exposes posts", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://www.instagram.com/gated.test/") {
        return htmlResponse(profileHtml({ username: "gated.test", media: [] }));
      }
      return new Response("", { status: 429 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const profile = await fetchPublicProfile("gated.test");

    expect(profile.followers).toBe(59057);
    expect(profile.recentPosts).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("serves repeat lookups from the in-memory cache", async () => {
    const fetchMock = installFetch(
      { username: "cache.test", media: [RECENT_REEL] },
      { Df4OwDzx_Ud: htmlResponse(embedHtml(100, 5)) },
    );

    await fetchPublicProfile("cache.test");
    const callsAfterFirst = fetchMock.mock.calls.length;
    await fetchPublicProfile("CACHE.TEST");

    expect(fetchMock).toHaveBeenCalledTimes(callsAfterFirst);
  });

  it("keeps partial results when an embed cannot be read", async () => {
    installFetch(
      { username: "partial.test", media: [RECENT_REEL, RECENT_PHOTO] },
      { Df4OwDzx_Ud: htmlResponse(embedHtml(100, 5)) },
    );

    const profile = await fetchPublicProfile("partial.test");

    expect(profile.recentPosts).toHaveLength(1);
    expect(profile.recentPosts[0].id).toBe("Df4OwDzx_Ud");
  });

  it("returns private accounts without posts or embeds", async () => {
    const fetchMock = installFetch(
      {
        username: "private.test",
        isPrivate: true,
        media: [RECENT_REEL, RECENT_PHOTO],
      },
      {},
    );

    const resolution = await resolveProfile("private.test");

    expect(resolution.status).toBe("found");
    if (resolution.status !== "found") {
      throw new Error("expected a private profile");
    }

    expect(resolution.profile.source).toBe("public");
    expect(resolution.profile.isPrivate).toBe(true);
    expect(resolution.profile.recentPosts).toEqual([]);
    expect(resolution.profile.postsCount).toBe(453);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const metrics = computeMetrics(resolution.profile);
    expect(metrics.followerGrowthPct).toBeNull();
    expect(metrics.authenticityPct).toBeNull();
    expect(metrics.growthEstimated).toBe(false);
    expect(metrics.authenticityEstimated).toBe(false);
  });

  it("reports unknown handles as not found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));

    const resolution = await resolveProfile("missing.handle");

    expect(resolution.status).toBe("not_found");
    if (resolution.status !== "not_found") {
      throw new Error("expected not found");
    }
    expect(resolution.message).toContain("No public Instagram profile");
  });

  it("treats Instagram's generic 200 shell as not found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        htmlResponse("<!DOCTYPE html><html><head><title>Instagram</title></head><body></body></html>"),
      ),
    );

    const resolution = await resolveProfile("empty.shell");

    expect(resolution.status).toBe("not_found");
    if (resolution.status !== "not_found") {
      throw new Error("expected not found");
    }
    expect(resolution.message).toContain("No public Instagram profile");
  });

  it("surfaces rate limiting as a retryable error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 429 })));

    const resolution = await resolveProfile("limited.handle");

    expect(resolution.status).toBe("error");
    if (resolution.status !== "error") {
      throw new Error("expected an error");
    }
    expect(resolution.message).toContain("limiting public lookups");
  });

  it("falls back to public data when the official API fails", async () => {
    vi.stubEnv("IG_ACCESS_TOKEN", "test-token");
    vi.stubEnv("IG_BUSINESS_ACCOUNT_ID", "17841400000000000");

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith("https://graph.facebook.com/")) {
        return new Response(JSON.stringify({ error: { message: "temporary failure" } }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url === "https://www.instagram.com/fallback.test/") {
        return htmlResponse(
          profileHtml({ username: "fallback.test", media: [RECENT_REEL] }),
        );
      }

      return htmlResponse(embedHtml(50, 4));
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolution = await resolveProfile("fallback.test");

    expect(resolution.status).toBe("found");
    if (resolution.status !== "found") {
      throw new Error("expected a public fallback");
    }

    expect(resolution.profile.source).toBe("public");
    expect(resolution.profile.recentPosts[0].likes).toBe(50);
    expect(String(fetchMock.mock.calls[0][0])).toContain("graph.facebook.com");
    expect(String(fetchMock.mock.calls[1][0])).toContain("instagram.com/fallback.test/");
  });

  it("routes lookups through ScrapingBee when a key is configured", async () => {
    vi.stubEnv("SCRAPINGBEE_API_KEY", "test-key");
    const media = { ...RECENT_REEL, likes: 500, comments: 40 };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://app.scrapingbee.com/api/v1/")) {
        const parsed = new URL(url);
        expect(parsed.searchParams.get("url")).toBe("https://www.instagram.com/scraper.test/");
        expect(parsed.searchParams.get("premium_proxy")).toBe("true");
        expect(parsed.searchParams.get("render_js")).toBe("false");
        expect(init?.headers).toMatchObject({ Authorization: "Bearer test-key" });
        return htmlResponse(profileHtml({ username: "scraper.test", media: [media] }));
      }
      return new Response("", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const profile = await fetchPublicProfile("scraper.test");

    expect(profile.username).toBe("scraper.test");
    expect(profile.recentPosts).toHaveLength(1);
    expect(profile.recentPosts[0]).toMatchObject({ likes: 500, comments: 40 });
    expect(String(fetchMock.mock.calls[0][0])).toContain("app.scrapingbee.com");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to a direct fetch when the scraper service fails", async () => {
    vi.stubEnv("SCRAPINGBEE_API_KEY", "test-key");
    const media = { ...RECENT_REEL, likes: 120, comments: 12 };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://app.scrapingbee.com/")) {
        return new Response("service unavailable", { status: 500 });
      }
      if (url === "https://www.instagram.com/direct.fallback/") {
        return htmlResponse(profileHtml({ username: "direct.fallback", media: [media] }));
      }
      return new Response("", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const profile = await fetchPublicProfile("direct.fallback");

    expect(profile.username).toBe("direct.fallback");
    expect(profile.recentPosts).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("instagram.com/direct.fallback/");
  });

  it("caps post-embed requests when a paid scraper key is configured", async () => {
    vi.stubEnv("SCRAPINGBEE_API_KEY", "test-key");
    const media = Array.from({ length: 5 }, (_, index) => ({
      ...RECENT_REEL,
      pk: String(Number(RECENT_REEL.pk) + index * 10_000_000_000_000),
    }));

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (
        url.startsWith("https://app.scrapingbee.com/api/v1/") &&
        new URL(url).searchParams.get("url")?.includes("/embed/captioned/")
      ) {
        return htmlResponse(embedHtml(42, 3));
      }
      if (url.startsWith("https://app.scrapingbee.com/api/v1/")) {
        return htmlResponse(profileHtml({ username: "embed.cap", media }));
      }
      return new Response("", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const profile = await fetchPublicProfile("embed.cap");

    const embedCalls = fetchMock.mock.calls.filter(([input]) =>
      new URL(String(input)).searchParams.get("url")?.includes("/embed/captioned/"),
    );
    expect(profile.recentPosts).toHaveLength(3);
    expect(embedCalls).toHaveLength(3);
  });
});
