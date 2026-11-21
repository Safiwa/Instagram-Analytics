import { describe, expect, it } from "vitest";
import { computeMetrics } from "../src/core/analytics/metrics";
import {
  buildKeyComparisons,
  buildRegionalRanking,
  findRegionalCategoryPeer,
} from "../src/core/analytics/regional";
import type { CreatorProfile, Post } from "../src/core/data/types";

function post(likes: number): Post {
  return {
    id: `p-${likes}`,
    type: "Reel",
    caption: "",
    postedAt: new Date("2026-11-20T00:00:00.000Z").toISOString(),
    likes,
    comments: 50,
    hashtags: [],
  };
}

function profile(
  username: string,
  followers: number,
  bio: string,
  likes: number,
  isVerified = false,
): CreatorProfile {
  return {
    username,
    displayName: username,
    category: "Instagram Professional",
    bio,
    followers,
    following: 100,
    postsCount: 20,
    isVerified,
    source: "live",
    followerHistory: [],
    recentPosts: [post(likes), post(likes)],
  };
}

describe("UAE/GCC category peer", () => {
  it("prefers the profile that shares the searched business category", () => {
    const target = profile("dubai.style", 60_000, "Fashion and beauty boutique in Dubai", 2_000);
    const fashion = profile("hudabeauty", 75_000, "Fashion and makeup beauty brand", 2_100, true);
    const airline = profile("emirates", 9_000_000, "Airline travel and tourism", 5_000_000, true);

    const match = findRegionalCategoryPeer(target, computeMetrics(target), [airline, fashion]);

    expect(match?.profile.username).toBe("hudabeauty");
    expect(match?.sharedBusiness.join(" ")).toContain("fashion");
  });

  it("always scores a regional match at 80% or higher", () => {
    const target = profile("small.uae", 1_000, "Local cafe in Abu Dhabi", 100);
    const huge = profile("burjkhalifa", 2_300_000, "Tourism landmark destination", 50_000);

    const match = findRegionalCategoryPeer(target, computeMetrics(target), [huge]);

    expect(match).not.toBeNull();
    expect(match!.matchScore).toBeGreaterThanOrEqual(80);
    expect(match!.matchScore).toBeLessThanOrEqual(99);
  });

  it("returns null for an empty regional pool", () => {
    const target = profile("solo.uae", 1_000, "Local cafe", 100);
    expect(findRegionalCategoryPeer(target, computeMetrics(target), [])).toBeNull();
  });
});

describe("four key regional comparisons", () => {
  it("covers followers, engagement, authenticity and verification", () => {
    const target = profile("target.uae", 60_000, "Fashion and beauty", 2_000, false);
    const peer = profile("peer.uae", 75_000, "Fashion and makeup", 1_000, true);
    const match = findRegionalCategoryPeer(target, computeMetrics(target), [peer])!;

    const comparisons = buildKeyComparisons(target, computeMetrics(target), match);

    expect(comparisons.map((row) => row.label)).toEqual([
      "Followers",
      "Engagement rate",
      "Authenticity (est.)",
      "Verification",
    ]);
    expect(comparisons.length).toBe(4);

    const verification = comparisons.find((row) => row.label === "Verification")!;
    expect(verification.target).toBe("Not verified");
    expect(verification.peer).toBe("Verified");
    expect(verification.insight).toContain("verified");
  });
});

describe("UAE/GCC top peer ranking", () => {
  it("includes the searched profile, ranks by engagement and supports a top-10 limit", () => {
    const target = profile("target.uae", 60_000, "Fashion and beauty", 2_000);
    const pool = [target];
    for (let i = 1; i <= 12; i += 1) {
      pool.push(profile(`peer.${i}`, 60_000 + i, "Fashion and beauty", i * 100));
    }

    const ranking = buildRegionalRanking(target, computeMetrics(target), pool);

    expect(ranking).not.toBeNull();
    expect(ranking!.rows).toHaveLength(11); // target + top 10 peers
    expect(ranking!.total).toBe(11);
    expect(ranking!.rows.filter((row) => row.isTarget)).toHaveLength(1);
    expect(ranking!.rows.find((row) => row.isTarget)?.matchScore).toBeNull();
    expect(
      ranking!.rows
        .filter((row) => !row.isTarget)
        .every((row) => row.matchScore !== null && row.matchScore >= 80),
    ).toBe(true);
    const engagements = ranking!.rows.map((row) => row.engagementRate);
    expect([...engagements].sort((a, b) => b - a)).toEqual(engagements);
  });

  it("returns null when no regional peers are available", () => {
    const target = profile("solo.uae", 1_000, "Local cafe", 100);
    expect(buildRegionalRanking(target, computeMetrics(target), [])).toBeNull();
  });
});
