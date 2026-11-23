import { describe, expect, it } from "vitest";
import {
  isComparableRange,
  RANK_WEIGHTS,
  rankFactorSimilarity,
  rankFactors,
  rankScore,
  REGIONAL_AUTHENTICITY_WEIGHT,
  regionalRankScore,
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

describe("shared weighted ranking", () => {
  it("derives followers, engagement, likes, comments and measured follower change", () => {
    const target = profile(100_000);
    const factors = rankFactors(target, {
      avgLikes: 1_000,
      avgComments: 100,
      avgSaves: null,
      engagementRate: 1.1,
      engagementBasis: "likes+comments",
      engagementSource: "public-posts",
      thirdPartyEngagement: null,
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
    expect(factors.avgLikes).toBe(1_000);
    expect(factors.avgComments).toBe(100);
    expect(factors.followerChangePct).toBeCloseTo(11.11, 2);
    expect(factors.followerChangeEstimated).toBe(false);
    expect(rankScore(factors)).toBeGreaterThan(0);
  });

  it("splits the former interaction weight into separate likes and comments weights", () => {
    expect(RANK_WEIGHTS).toEqual({
      followers: 0.55,
      engagement: 0.2,
      avgLikes: 0.1,
      avgComments: 0.05,
      followerChange: 0.1,
    });
  });

  it("keeps benchmarks inside a similar follower and engagement range", () => {
    const target = { followers: 100_000, engagementRate: 1.5 };

    expect(isComparableRange(target, { followers: 220_000, engagementRate: 2.4 })).toBe(true);
    expect(isComparableRange(target, { followers: 2_000_000, engagementRate: 2.4 })).toBe(false);
    expect(isComparableRange(target, { followers: 90_000, engagementRate: 12 })).toBe(false);
    expect(isComparableRange(target, { followers: 0, engagementRate: 1.5 })).toBe(false);
  });

  it("scores a close five-signal profile above a distant one", () => {
    const target = profile(100_000);
    const targetFactors = rankFactors(target, {
      avgLikes: 1_000,
      avgComments: 100,
      avgSaves: null,
      engagementRate: 1.1,
      engagementBasis: "likes+comments",
      engagementSource: "public-posts",
      thirdPartyEngagement: null,
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
    const closeFactors = {
      ...targetFactors,
      followers: 120_000,
      avgLikes: 1_300,
      avgComments: 130,
    };
    const distantFactors = { ...targetFactors, followers: 10, avgLikes: 20, avgComments: 2 };

    expect(rankFactorSimilarity(targetFactors, closeFactors)).toBeGreaterThan(
      rankFactorSimilarity(targetFactors, distantFactors),
    );
  });
});

describe("authenticity-aware regional ranking", () => {
  const factors = {
    followers: 100_000,
    engagementRate: 1.1,
    avgLikes: 1_000,
    avgComments: 100,
    followerChangePct: 11.11,
  };

  it("blends the weighted score with authenticity", () => {
    const base = rankScore(factors);

    expect(REGIONAL_AUTHENTICITY_WEIGHT).toBe(0.1);
    expect(regionalRankScore(factors, 100)).toBeCloseTo(base * 0.9 + 10, 2);
    expect(regionalRankScore(factors, 0)).toBeCloseTo(base * 0.9, 2);
    expect(regionalRankScore(factors, 100)).toBeGreaterThan(regionalRankScore(factors, 40));
  });

  it("excludes a missing authenticity instead of treating it as zero", () => {
    expect(regionalRankScore(factors, null)).toBe(rankScore(factors));
    expect(regionalRankScore(factors, null)).toBeGreaterThan(regionalRankScore(factors, 0));
    expect(regionalRankScore(factors, 200)).toBe(regionalRankScore(factors, 100));
    expect(regionalRankScore(factors, -20)).toBe(regionalRankScore(factors, 0));
  });
});
