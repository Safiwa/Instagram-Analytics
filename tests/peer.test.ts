import { describe, expect, it } from "vitest";
import { computeMetrics } from "../src/core/analytics/metrics";
import { buildPeerRanking, findClosestPeer } from "../src/core/analytics/peer";
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

function profile(username: string, followers: number, bio: string, likes: number): CreatorProfile {
  return {
    username,
    displayName: username,
    category: "Instagram Professional",
    bio,
    followers,
    following: 100,
    postsCount: 20,
    isVerified: false,
    source: "live",
    followerHistory: [],
    recentPosts: [post(likes), post(likes)],
  };
}

describe("closest public peer", () => {
  it("prefers a similarly sized profile with shared business themes", () => {
    const target = profile("uae.style", 60_000, "Fashion and skincare boutique in Dubai", 2_000);
    const fashion = profile("fashion.peer", 75_000, "Fashion and beauty daily looks", 2_100);
    const footballer = profile("cristiano", 680_000_000, "Football player", 5_000_000);

    const match = findClosestPeer(target, computeMetrics(target), [footballer, fashion]);

    expect(match?.profile.username).toBe("fashion.peer");
    expect(match?.reasons.join(" ")).toContain("fashion");
    expect(match?.score).toBeGreaterThan(0);
  });

  it("excludes the target itself and handles an empty pool", () => {
    const target = profile("solo", 20_000, "Food blogger", 800);

    expect(findClosestPeer(target, computeMetrics(target), [])).toBeNull();
    expect(findClosestPeer(target, computeMetrics(target), [target])).toBeNull();
  });
});

describe("peer ranking for the searched profile", () => {
  it("includes the searched profile and ranks the group by engagement rate", () => {
    const target = profile("searched", 60_000, "Fashion and skincare boutique", 2_000);
    const low = profile("low.peer", 62_000, "Fashion and beauty", 500);
    const high = profile("high.peer", 58_000, "Fashion and style", 8_000);
    const pool = [target, low, high];

    const ranking = buildPeerRanking(target, computeMetrics(target), pool);

    expect(ranking).not.toBeNull();
    expect(ranking!.rows.map((row) => row.profile.username)).toEqual([
      "high.peer",
      "searched",
      "low.peer",
    ]);
    expect(ranking!.targetRank).toBe(2);
    expect(ranking!.total).toBe(3);
    expect(ranking!.outperformedPercent).toBe(50);
    expect(ranking!.rows.find((row) => row.isTarget)?.matchScore).toBeNull();
    expect(ranking!.rows.filter((row) => !row.isTarget).every((row) => row.matchScore !== null)).toBe(
      true,
    );
  });

  it("returns null when no comparable peer is available", () => {
    const target = profile("solo", 20_000, "Food blogger", 800);
    expect(buildPeerRanking(target, computeMetrics(target), [])).toBeNull();
  });
});
