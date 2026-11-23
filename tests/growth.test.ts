import { describe, expect, it } from "vitest";
import { analyzeGrowth } from "../src/core/analytics/growth";
import type { CreatorProfile, MonthlyPoint, Post } from "../src/core/data/types";

const NOW = new Date("2026-11-21T12:00:00.000Z");

function post(daysAgo: number, likes: number, type: Post["type"] = "Reel"): Post {
  return {
    id: `p-${daysAgo}-${type}`,
    type,
    caption: "",
    postedAt: new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    likes,
    comments: 100,
    hashtags: [],
  };
}

function profile(overrides: Partial<CreatorProfile> = {}): CreatorProfile {
  return {
    username: "test.profile",
    displayName: "Test Profile",
    category: "Instagram Professional",
    bio: "",
    followers: 50_000,
    following: 200,
    postsCount: 40,
    isVerified: false,
    source: "live",
    followerHistory: [],
    recentPosts: [post(2, 3_000), post(6, 2_500), post(10, 2_200), post(14, 2_000)],
    ...overrides,
  };
}

describe("30-day growth analysis", () => {
  it("uses measured history for demo fixtures without modeling", () => {
    const history: MonthlyPoint[] = [
      { month: "Sep", followers: 100_000 },
      { month: "Oct", followers: 110_000 },
      { month: "Nov", followers: 125_000 },
    ];
    const result = analyzeGrowth(profile({ source: "demo", followerHistory: history }), NOW);

    expect(result.monthGrowthPct).toBe(13.64);
    expect(result.monthGrowthFollowers).toBe(15_000);
    expect(result.growthEstimated).toBe(false);
  });

  it("labels a live profile's 30-day follower change as an estimate", () => {
    const result = analyzeGrowth(profile(), NOW);

    expect(result.growthEstimated).toBe(true);
    expect(result.monthGrowthPct).not.toBeNull();
    expect(result.monthGrowthPct!).toBeGreaterThanOrEqual(-8);
    expect(result.monthGrowthPct!).toBeLessThanOrEqual(12);
    expect(result.reelsLast30Days).toBe(4);
    expect(result.postsPerWeek).not.toBeNull();
    expect(result.engagementTrendPct).not.toBeNull();
  });

  it("marks a full 12-post public window as a minimum rather than an exact count", () => {
    const posts = Array.from({ length: 12 }, (_, index) => post(index + 1, 2_000 + index));
    const result = analyzeGrowth(profile({ recentPosts: posts }), NOW);

    expect(result.reelsLast30Days).toBe(12);
    expect(result.postsInWindowCapped).toBe(true);
    expect(result.basis).toContain("12 recent posts");
    expect(result.basis).toContain("minimum");
  });

  it("counts only reels inside the 30-day window", () => {
    const posts = [
      post(2, 3_000),
      post(4, 2_000, "Carousel"),
      post(6, 2_500),
      post(8, 1_800, "Photo"),
      post(32, 1_500),
    ];
    const result = analyzeGrowth(profile({ recentPosts: posts }), NOW);

    expect(result.reelsLast30Days).toBe(2);
    expect(result.postsInWindowCapped).toBe(false);
  });

  it("does not flag a partial window as capped", () => {
    const posts = [
      ...Array.from({ length: 11 }, (_, index) => post(index + 1, 2_000 + index)),
      post(45, 1_500),
    ];
    const result = analyzeGrowth(profile({ recentPosts: posts }), NOW);

    expect(result.reelsLast30Days).toBe(11);
    expect(result.postsInWindowCapped).toBe(false);
  });

  it("returns null metrics for private or postless profiles", () => {
    const result = analyzeGrowth(profile({ isPrivate: true, recentPosts: [] }), NOW);

    expect(result.monthGrowthPct).toBeNull();
    expect(result.monthGrowthFollowers).toBeNull();
    expect(result.momentum).toBe("unknown");
    expect(result.reelsLast30Days).toBe(0);
    expect(result.postsInWindowCapped).toBe(false);
  });
});
