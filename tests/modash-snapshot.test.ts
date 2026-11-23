import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeMetrics } from "../src/core/analytics/metrics";
import {
  getModashEngagement,
  MODASH_CALCULATOR_URL,
} from "../src/core/data/modash-snapshot";
import type { CreatorProfile } from "../src/core/data/types";

const mocks = vi.hoisted(() => ({
  fetchPublicProfile: vi.fn(),
  isLiveConfigured: vi.fn(),
}));

vi.mock("../src/core/data/live", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/data/live")>();
  return { ...actual, isLiveConfigured: mocks.isLiveConfigured };
});

vi.mock("../src/core/data/public", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/data/public")>();
  return { ...actual, fetchPublicProfile: mocks.fetchPublicProfile };
});

import { resolveProfile } from "../src/core/data/adapter";

function publicProfile(username: string): CreatorProfile {
  return {
    username,
    displayName: username,
    category: "Instagram creator",
    bio: "No biography provided.",
    followers: 44_000,
    following: 2_417,
    postsCount: 185,
    isVerified: false,
    source: "public",
    followerHistory: [],
    recentPosts: [],
  };
}

describe("Modash engagement snapshot", () => {
  beforeEach(() => {
    mocks.fetchPublicProfile.mockReset();
    mocks.isLiveConfigured.mockReset();
    mocks.isLiveConfigured.mockReturnValue(false);
  });

  it("keeps only disclosed, non-secret third-party values", () => {
    const snapshot = getModashEngagement("@ZUHABOUTIQUE2024");

    expect(snapshot).toEqual({
      source: "Modash",
      sourceUrl: MODASH_CALCULATOR_URL,
      reportUpdatedAt: "2026-10-27T11:16:59.199Z",
      engagementRatePct: 1.2177911317490667,
      averageLikes: 47,
      averageComments: 22,
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/recaptcha|token|secret|cookie/i);
    expect(getModashEngagement("nora.style")).toBeNull();
  });

  it("uses the sourced ER, likes and comments without inventing other metrics", () => {
    const profile: CreatorProfile = {
      ...publicProfile("zuhaboutique2024"),
      thirdPartyEngagement: getModashEngagement("zuhaboutique2024") ?? undefined,
    };
    const metrics = computeMetrics(profile);

    expect(metrics.engagementRate).toBe(1.22);
    expect(metrics.avgLikes).toBe(47);
    expect(metrics.avgComments).toBe(22);
    expect(metrics.engagementBasis).toBe("third-party:likes+comments");
    expect(metrics.engagementSource).toBe("third-party");
    expect(metrics.thirdPartyEngagement?.source).toBe("Modash");
    expect(metrics.followerGrowthPct).toBeNull();
    expect(metrics.authenticityPct).toBeNull();
    expect(metrics.fakeFollowers).toBeNull();
    expect(metrics.estimateConfidence).toBeNull();
  });

  it("attaches the snapshot after a no-post public resolution", async () => {
    mocks.fetchPublicProfile.mockResolvedValue(publicProfile("zuhaboutique2024"));

    const resolution = await resolveProfile("@Zuhaboutique2024");

    expect(resolution.status).toBe("found");
    if (resolution.status !== "found") {
      throw new Error("expected a profile");
    }
    expect(resolution.profile.thirdPartyEngagement?.source).toBe("Modash");
    expect(computeMetrics(resolution.profile).engagementSource).toBe("third-party");
  });

  it("does not replace measured public-post engagement with the snapshot", async () => {
    mocks.fetchPublicProfile.mockResolvedValue({
      ...publicProfile("zuhaboutique2024"),
      recentPosts: [
        {
          id: "real-post",
          type: "Reel",
          caption: "A real public post",
          postedAt: "2026-11-20T00:00:00.000Z",
          likes: 500,
          comments: 50,
          hashtags: [],
        },
      ],
    });

    const resolution = await resolveProfile("zuhaboutique2024");

    expect(resolution.status).toBe("found");
    if (resolution.status !== "found") {
      throw new Error("expected a profile");
    }
    expect(resolution.profile.thirdPartyEngagement).toBeUndefined();
    expect(computeMetrics(resolution.profile).engagementSource).toBe("public-posts");
  });
});
