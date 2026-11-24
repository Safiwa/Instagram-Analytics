import { describe, expect, it } from "vitest";
import { estimatePublicSignals } from "../src/core/analytics/estimates";
import { analyzeGrowth } from "../src/core/analytics/growth";
import { computeMetrics, describeFakeFollowers } from "../src/core/analytics/metrics";
import { likesVisible, quartileDispersion } from "../src/core/analytics/posts";
import type { CreatorProfile, Post } from "../src/core/data/types";

const NOW = new Date("2026-11-24T12:00:00.000Z");

function post(day: number, likes: number, comments: number, views?: number): Post {
  return {
    id: `p-${day}`,
    type: "Reel",
    caption: "",
    postedAt: new Date(Date.UTC(2026, 9, 31 + day)).toISOString(),
    likes,
    comments,
    ...(views === undefined ? {} : { viewCount: views }),
    hashtags: [],
  };
}

// Mirrors the @amrmaskoun lookup that exposed the issues: 5 of 12 posts are
// paid partnerships with hidden likes (reported as 0) and one viral reel holds
// most of the likes.
function creator(overrides: Partial<CreatorProfile> = {}): CreatorProfile {
  return {
    username: "creator.case",
    displayName: "Creator Case",
    category: "Public figure",
    bio: "",
    followers: 5_800_000,
    following: 1_358,
    postsCount: 960,
    isVerified: true,
    source: "public",
    followerHistory: [],
    recentPosts: [
      post(0, 24_700, 1_000, 275_700),
      post(2, 0, 140),
      post(3, 0, 81),
      post(4, 14_400, 754, 248_000),
      post(6, 0, 213),
      post(6.5, 412_200, 9_600, 4_900_000),
      post(7, 6_300, 185, 135_700),
      post(11, 6_600, 180, 79_400),
      post(16, 10_600, 324),
      post(19, 0, 1_100),
      post(22, 7_900, 344, 139_900),
      post(23, 0, 700),
    ],
    ...overrides,
  };
}

describe("hidden like counts", () => {
  it("treats 0 likes with comments or views as hidden, not zero", () => {
    expect(likesVisible(post(0, 0, 12))).toBe(false);
    expect(likesVisible({ ...post(0, 50, 1), likesHidden: true })).toBe(false);
    expect(likesVisible(post(0, 0, 0))).toBe(true);
    expect(likesVisible(post(0, 900, 20))).toBe(true);
  });

  it("averages likes and engagement only over posts that show likes", () => {
    const metrics = computeMetrics(creator());
    expect(metrics.hiddenLikePosts).toBe(5);
    // 482.7K likes over the 7 visible posts, not over all 12.
    expect(metrics.avgLikes).toBeCloseTo(68_957, 0);
    expect(metrics.engagementRate).toBeGreaterThan(1.1);
    expect(metrics.engagementRate).toBeLessThan(1.3);
  });

  it("reports the typical (median) post next to the viral-inflated average", () => {
    const metrics = computeMetrics(creator());
    expect(metrics.typicalEngagementRate).not.toBeNull();
    expect(metrics.typicalEngagementRate!).toBeLessThan(0.25);
    expect(metrics.typicalEngagementRate!).toBeLessThan(metrics.engagementRate);
  });
});

describe("fake-follower model robustness", () => {
  it("does not flag one viral post as unstable engagement", () => {
    const viral = estimatePublicSignals(creator());
    const withoutViral = estimatePublicSignals(
      creator({ recentPosts: creator().recentPosts.filter((item) => item.likes !== 412_200) }),
    );
    expect(Math.abs(viral.fakeFollowersPct! - withoutViral.fakeFollowersPct!)).toBeLessThanOrEqual(2);
    expect(quartileDispersion([10, 11, 12, 13, 14, 15, 1_000])).toBeLessThan(1);
  });

  it("reports a range and risk band instead of a bare count", () => {
    const metrics = computeMetrics(creator());
    expect(metrics.fakeFollowersRange).not.toBeNull();
    expect(metrics.fakeFollowersRange!.lowPct).toBeLessThan(metrics.fakeFollowersPct!);
    expect(metrics.fakeFollowersRange!.highPct).toBeGreaterThan(metrics.fakeFollowersPct!);
    expect(describeFakeFollowers(metrics)).toMatch(/^\d+-\d+% \((Low|Medium|High) risk\)$/);
  });

  it("treats an unknown badge as neutral and lowers confidence", () => {
    const known = estimatePublicSignals(creator({ isVerified: false }));
    const unknown = estimatePublicSignals(
      creator({ isVerified: false, verificationUnknown: true }),
    );
    expect(unknown.fakeFollowersPct).toBe(known.fakeFollowersPct);
    expect(unknown.confidence).not.toBe("high");
    expect(unknown.signals.find((signal) => signal.label === "Verification")?.value).toContain(
      "Unknown",
    );
  });
});

describe("30-day vs 12-month consistency", () => {
  it("models the month as one twelfth of the yearly estimate", () => {
    const profile = creator();
    const annual = estimatePublicSignals(profile).followerGrowthPct!;
    const growth = analyzeGrowth(profile, NOW);
    expect(growth.growthEstimated).toBe(true);
    expect(growth.monthGrowthPct).toBeCloseTo(annual / 12, 1);
  });

  it("rounds modeled follower change so it does not read as an exact count", () => {
    const growth = analyzeGrowth(creator(), NOW);
    if (growth.monthGrowthFollowers !== null && growth.monthGrowthFollowers !== 0) {
      const digits = String(Math.abs(growth.monthGrowthFollowers)).replace(/0+$/, "");
      expect(digits.length).toBeLessThanOrEqual(2);
    }
  });
});
