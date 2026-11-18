import { describe, expect, it } from "vitest";
import { computeMetrics } from "../src/core/analytics/metrics";
import { getProfile } from "../src/core/data/adapter";

describe("profile metrics", () => {
  it("computes the agreed engagement, growth, and authenticity values", () => {
    const profile = getProfile("nora.style");
    expect(profile).not.toBeNull();
    if (!profile) {
      throw new Error("nora.style fixture is missing");
    }

    const metrics = computeMetrics(profile);

    expect(metrics.avgLikes).toBe(125);
    expect(metrics.avgComments).toBe(12.5);
    expect(metrics.avgSaves).toBe(25);
    expect(metrics.engagementRate).toBe(1.63);
    expect(metrics.followerGrowthPct).toBe(25);
    expect(metrics.authenticityPct).toBe(96.5);
    expect(metrics.fakeFollowers).toBe(350);
    expect(metrics.fakeFollowersPct).toBe(3.5);
    expect(metrics.growthEstimated).toBe(false);
    expect(metrics.authenticityEstimated).toBe(false);
    expect(metrics.estimateConfidence).toBeNull();
    expect(metrics.estimateSignals).toEqual([]);
  });

  it("returns safe metrics for empty series instead of dividing by zero", () => {
    const profile = getProfile("pixel.pilot");
    expect(profile).not.toBeNull();
    if (!profile) {
      throw new Error("pixel.pilot fixture is missing");
    }

    const empty = {
      ...profile,
      followers: 0,
      fakeFollowers: undefined,
      followerHistory: [],
      recentPosts: [],
    };

    const metrics = computeMetrics(empty);

    expect(metrics.engagementRate).toBe(0);
    expect(metrics.avgSaves).toBeNull();
    expect(metrics.engagementBasis).toBe("likes+comments");
    expect(metrics.followerGrowthPct).toBeNull();
    expect(metrics.authenticityPct).toBeNull();
    expect(metrics.fakeFollowers).toBeNull();
    expect(metrics.fakeFollowersPct).toBeNull();
    expect(metrics.growthEstimated).toBe(false);
    expect(metrics.authenticityEstimated).toBe(false);
    expect(metrics.estimateConfidence).toBeNull();
  });
});
