import { describe, expect, it } from "vitest";
import { estimatePublicSignals } from "../src/core/analytics/estimates";
import { computeMetrics } from "../src/core/analytics/metrics";
import type { CreatorProfile, Post } from "../src/core/data/types";

function post(index: number, likes: number, comments: number, views?: number): Post {
  const postedAt = new Date(Date.UTC(2026, 8, 1 + index * 7)).toISOString();
  return {
    id: `post-${index}`,
    type: "Reel",
    caption: `Public post ${index}`,
    postedAt,
    likes,
    comments,
    ...(views === undefined ? {} : { viewCount: views }),
    hashtags: ["#public"],
  };
}

function strongProfile(): CreatorProfile {
  return {
    username: "signal.public",
    displayName: "Trending Public",
    category: "Creator",
    bio: "Public signals",
    followers: 20_000,
    following: 400,
    postsCount: 240,
    isVerified: true,
    source: "public",
    followerHistory: [],
    recentPosts: Array.from({ length: 10 }, (_, index) =>
      post(index, 1000 + index * 10, 80 + index, 12_000),
    ),
  };
}

function weakProfile(): CreatorProfile {
  return {
    username: "weak.public",
    displayName: "Weak Public",
    category: "Creator",
    bio: "Weak signals",
    followers: 5_000,
    following: 6_000,
    postsCount: 12,
    isVerified: false,
    source: "public",
    followerHistory: [],
    recentPosts: [post(0, 20, 5), post(1, 21, 5), post(2, 19, 5)],
  };
}

const EMPTY_ESTIMATES = {
  fakeFollowers: null,
  fakeFollowersPct: null,
  authenticityPct: null,
  followerGrowthPct: null,
  confidence: null,
  signals: [],
  methodology: null,
};

describe("public-signal estimates", () => {
  it("models visible public accounts and exposes the disclosure fields", () => {
    const profile = strongProfile();

    const estimates = estimatePublicSignals(profile);
    const metrics = computeMetrics(profile);

    expect(estimates.fakeFollowers).toBeGreaterThan(0);
    expect(estimates.fakeFollowers).toBeLessThan(profile.followers);
    expect(estimates.fakeFollowersPct).toBeGreaterThanOrEqual(2);
    expect(estimates.authenticityPct).toBeGreaterThan(90);
    expect(estimates.followerGrowthPct).not.toBeNull();
    expect(estimates.confidence).toBe("high");
    expect(estimates.signals.map((signal) => signal.label)).toContain(
      "Engagement vs size benchmark",
    );
    expect(estimates.methodology).toContain("estimates, not measurements");

    expect(metrics.fakeFollowers).toBe(estimates.fakeFollowers);
    expect(metrics.fakeFollowersPct).toBe(estimates.fakeFollowersPct);
    expect(metrics.authenticityPct).toBe(estimates.authenticityPct);
    expect(metrics.followerGrowthPct).toBe(estimates.followerGrowthPct);
    expect(metrics.authenticityEstimated).toBe(true);
    expect(metrics.growthEstimated).toBe(true);
    expect(metrics.estimateConfidence).toBe("high");
    expect(metrics.estimateSignals).toHaveLength(estimates.signals.length);
  });

  it("rates weak public signals as lower authenticity with low confidence", () => {
    const strong = estimatePublicSignals(strongProfile());
    const weak = estimatePublicSignals(weakProfile());

    expect(weak.fakeFollowersPct).toBe(65);
    expect(weak.authenticityPct).toBe(35);
    expect(weak.confidence).toBe("low");
    expect(weak.fakeFollowersPct).toBeGreaterThan(Number(strong.fakeFollowersPct));
    expect(Number(weak.authenticityPct)).toBeLessThan(Number(strong.authenticityPct));
    expect(Number(weak.followerGrowthPct)).toBeLessThan(Number(strong.followerGrowthPct));
  });

  it("does not estimate private accounts, empty feeds, or zero-follower accounts", () => {
    const profile = strongProfile();

    expect(estimatePublicSignals({ ...profile, isPrivate: true })).toEqual(EMPTY_ESTIMATES);
    expect(estimatePublicSignals({ ...profile, recentPosts: [] })).toEqual(EMPTY_ESTIMATES);
    expect(estimatePublicSignals({ ...profile, followers: 0 })).toEqual(EMPTY_ESTIMATES);
  });

  it("leaves demo measurements unmodeled in computeMetrics", () => {
    const profile: CreatorProfile = {
      ...strongProfile(),
      source: "demo",
      fakeFollowers: 1_000,
      followerHistory: [
        { month: "Oct 26", followers: 18_000 },
        { month: "Nov 26", followers: 20_000 },
      ],
    };

    const metrics = computeMetrics(profile);

    expect(metrics.fakeFollowers).toBe(1_000);
    expect(metrics.authenticityPct).toBe(95);
    expect(metrics.followerGrowthPct).toBe(11.11);
    expect(metrics.authenticityEstimated).toBe(false);
    expect(metrics.growthEstimated).toBe(false);
    expect(metrics.estimateConfidence).toBeNull();
    expect(metrics.estimateSignals).toEqual([]);
  });
});
