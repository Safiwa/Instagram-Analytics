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
    displayName: "Instagram Public",
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

function cristianoPost(
  id: string,
  type: Post["type"],
  postedAt: string,
  likes: number,
  comments: number,
  viewCount?: number,
): Post {
  return {
    id,
    type,
    caption: "Public Instagram post",
    postedAt,
    likes,
    comments,
    ...(viewCount === undefined ? {} : { viewCount }),
    hashtags: [],
  };
}

// Live production snapshot captured on 2026-11-22. The numeric inputs are the
// exact Business Discovery values returned for @cristiano at that time.
function cristianoProfile(): CreatorProfile {
  return {
    username: "cristiano",
    displayName: "Cristiano Ronaldo",
    category: "Instagram Professional",
    bio: "No biography provided.",
    followers: 680_533_697,
    following: 639,
    postsCount: 4_158,
    isVerified: true,
    source: "live",
    followerHistory: [],
    recentPosts: [
      cristianoPost("18112835852616919", "Photo", "2026-11-19T10:31:47+0000", 2_606_343, 30_894),
      cristianoPost("18038275970903235", "Reel", "2026-11-16T17:54:43+0000", 8_382_188, 135_420, 204_305_573),
      cristianoPost("17873521698649031", "Photo", "2026-11-13T16:30:16+0000", 5_932_954, 95_011),
      cristianoPost("18110789852360437", "Carousel", "2026-11-11T18:34:35+0000", 7_290_546, 55_524),
      cristianoPost("18065045768526831", "Reel", "2026-11-05T10:21:46+0000", 38_034_245, 3_810_791, 618_596_085),
      cristianoPost("17927243994201618", "Carousel", "2026-11-03T11:28:44+0000", 5_854_317, 52_261),
      cristianoPost("17927174337434890", "Carousel", "2026-10-29T20:18:43+0000", 6_867_182, 98_893),
      cristianoPost("17984467133902164", "Photo", "2026-10-29T13:24:02+0000", 17_997_406, 623_207),
      cristianoPost("17896301661453713", "Carousel", "2026-10-28T18:39:34+0000", 8_778_360, 68_397),
      cristianoPost("17887598169687124", "Carousel", "2026-10-24T18:34:56+0000", 5_351_627, 36_376),
      cristianoPost("18127797400901017", "Carousel", "2026-10-23T15:56:02+0000", 5_586_029, 59_735),
      cristianoPost("18115341707019219", "Carousel", "2026-10-20T20:32:36+0000", 5_058_893, 38_569),
    ],
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

  it("keeps @cristiano's huge-follower snapshot at the bounded fake-share floor", () => {
    const profile = cristianoProfile();
    const estimates = estimatePublicSignals(profile);
    const metrics = computeMetrics(profile);

    expect(profile.source).toBe("live");
    expect(profile.fakeFollowers).toBeUndefined();
    expect(profile.followerHistory).toEqual([]);
    expect(metrics.engagementRate).toBe(1.5);

    expect(estimates.fakeFollowersPct).toBe(2);
    expect(estimates.fakeFollowers).toBe(13_610_674);
    expect(estimates.authenticityPct).toBe(98);
    expect(estimates.confidence).toBe("high");
    expect(estimates.fakeFollowers).toBeLessThan(profile.followers * 0.03);
    expect(estimates.methodology).toContain("estimates, not measurements");

    expect(metrics.fakeFollowersPct).toBe(2);
    expect(metrics.fakeFollowers).toBe(estimates.fakeFollowers);
    expect(metrics.authenticityPct).toBe(98);
    expect(metrics.authenticityEstimated).toBe(true);
    expect(metrics.growthEstimated).toBe(true);
    expect(metrics.estimateConfidence).toBe("high");
    expect(metrics.estimateMethodology).toBe(estimates.methodology);
    expect(metrics.estimateSignals.map((signal) => signal.label)).toContain("Verification");
    expect(metrics.estimateSignals.map((signal) => signal.label)).toContain("Public reach proxy");

    const verification = metrics.estimateSignals.find(
      (signal) => signal.label === "Verification",
    );
    expect(verification).toMatchObject({ value: "Verified badge", impact: "positive" });
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
