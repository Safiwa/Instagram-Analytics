import { describe, expect, it } from "vitest";
import {
  isComparableRange,
  rankFactorSimilarity,
  rankFactors,
  rankScore,
} from "../src/core/analytics/rank";
import type { CreatorProfile } from "../src/core/data/types";

function profile(followers: number): CreatorProfile {
  return {
    username: "sample",
    displayName: "Sample",
    category: "Digital creator",
    bio: "",
    followers,
    following: 100,
    postsCount: 2,
    isVerified: false,
    source: "live",
    followerHistory: [{ month: "2026-10", followers: followers * 0.9 }, { month: "2026-11", followers }],
    recentPosts: [
      {
        id: "p1",
        type: "Reel",
        caption: "",
        postedAt: new Date("2026-11-20T00:00:00.000Z").toISOString(),
        likes: followers * 0.01,
        comments: followers * 0.001,
        hashtags: [],
      },
      {
        id: "p2",
        type: "Reel",
        caption: "",
        postedAt: new Date("2026-11-10T00:00:00.000Z").toISOString(),
        likes: followers * 0.01,
        comments: followers * 0.001,
        hashtags: [],
      },
    ],
  };
}

describe("shared four-factor ranking", () => {
  it("derives followers, engagement, interactions and measured follower change", () => {
    const target = profile(100_000);
    const factors = rankFactors(target, {
      avgLikes: 1_000,
      avgComments: 100,
      avgSaves: null,
      engagementRate: 1.1,
      engagementBasis: "likes+comments",
      fakeFollowers: null,
      fakeFollowersPct: null,
      followerGrowthPct: 11.11,
      authenticityPct: null,
      growthEstimated: false,
      authenticityEstimated: false,
      estimateConfidence: null,
      estimateSignals: [],
      estimateMethodology: null,
    });

    expect(factors.followers).toBe(100_000);
    expect(factors.engagementRate).toBe(1.1);
    expect(factors.avgInteractions).toBe(1_100);
    expect(factors.followerChangePct).toBeCloseTo(11.11, 2);
    expect(factors.followerChangeEstimated).toBe(false);
    expect(rankScore(factors)).toBeGreaterThan(0);
  });

  it("keeps benchmarks inside a similar follower and engagement range", () => {
    const target = { followers: 100_000, engagementRate: 1.5 };

    expect(isComparableRange(target, { followers: 220_000, engagementRate: 2.4 })).toBe(true);
    expect(isComparableRange(target, { followers: 2_000_000, engagementRate: 2.4 })).toBe(false);
    expect(isComparableRange(target, { followers: 90_000, engagementRate: 12 })).toBe(false);
    expect(isComparableRange(target, { followers: 0, engagementRate: 1.5 })).toBe(false);
  });

  it("scores a close four-factor profile above a distant one", () => {
    const target = profile(100_000);
    const targetFactors = rankFactors(target, {
      avgLikes: 1_000,
      avgComments: 100,
      avgSaves: null,
      engagementRate: 1.1,
      engagementBasis: "likes+comments",
      fakeFollowers: null,
      fakeFollowersPct: null,
      followerGrowthPct: null,
      authenticityPct: null,
      growthEstimated: false,
      authenticityEstimated: false,
      estimateConfidence: null,
      estimateSignals: [],
      estimateMethodology: null,
    });
    const closeFactors = { ...targetFactors, followers: 120_000, avgInteractions: 1_300 };
    const distantFactors = { ...targetFactors, followers: 10, avgInteractions: 20 };

    expect(rankFactorSimilarity(targetFactors, closeFactors)).toBeGreaterThan(
      rankFactorSimilarity(targetFactors, distantFactors),
    );
  });
});
