import { describe, expect, it } from "vitest";
import { computeMetrics } from "../src/core/analytics/metrics";
import { buildPeerRanking, findClosestPeer, findSimilarPeers } from "../src/core/analytics/peer";
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

describe("country-aware peer suggestions", () => {
  it("prefers same-country profiles and rejects out-of-range followers", () => {
    const target = profile("dubai.style", 60_000, "Fashion and beauty", 2_000);
    const closeFit = profile("uae.close", 70_000, "Fashion and beauty", 2_200);
    const weakFit = profile("uae.weak", 2_000, "Fashion and beauty", 100);
    const otherCountry = profile("london.style", 90_000, "Fashion and beauty", 3_000);

    const suggestions = findSimilarPeers(target, computeMetrics(target), [
      otherCountry,
      weakFit,
      closeFit,
    ]);

    expect(suggestions.map((match) => match.profile.username)).toEqual(["uae.close"]);
    expect(suggestions.every((match) => match.country.country === "United Arab Emirates")).toBe(
      true,
    );
    expect(suggestions[0].reasons.join(" ")).toContain("similar audience size and engagement range");
    expect(suggestions[0].reasons.join(" ")).toContain("four-factor fit");
  });

  it("never benchmarks thousands of followers against millions", () => {
    const target = profile("small.style", 50_000, "Fashion and beauty", 1_500);
    const mega = profile("mega.style", 5_000_000, "Fashion and beauty", 100_000);
    const hugeEngagement = profile("viral.style", 55_000, "Fashion and beauty", 60_000);

    const suggestions = findSimilarPeers(target, computeMetrics(target), [mega, hugeEngagement]);

    expect(suggestions).toEqual([]);
  });

  it("uses promoted-location hashtags when the handle has no country word", () => {
    const target = {
      ...profile("style.studio", 60_000, "Fashion and beauty", 2_000),
      recentPosts: [
        { ...post(2_000), caption: "Dubai edit", hashtags: ["#Dubai", "#UAE"] },
        { ...post(1_800), caption: "Abu Dhabi find", hashtags: ["#AbuDhabi"] },
      ],
    };
    const sameCountry = profile("beauty.dubai", 40_000, "Fashion and beauty", 1_500);
    const otherCountry = profile("beauty.paris", 80_000, "Fashion and beauty", 2_500);

    const match = findClosestPeer(target, computeMetrics(target), [otherCountry, sameCountry]);

    expect(match?.profile.username).toBe("beauty.dubai");
    expect(match?.countryRelationship).toBe("same-country");
  });
});

describe("peer ranking for the searched profile", () => {
  it("includes the searched profile and ranks the group by four-factor score", () => {
    const target = profile("searched", 60_000, "Fashion and skincare boutique", 2_000);
    const low = profile("low.peer", 62_000, "Fashion and beauty", 1_600);
    const high = profile("high.peer", 58_000, "Fashion and style", 2_600);
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
    const scores = ranking!.rows.map((row) => row.rankScore);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(ranking!.rows.every((row) => typeof row.avgInteractions === "number")).toBe(true);
    expect(ranking!.rows.every((row) => typeof row.followerChangePct === "number")).toBe(true);
    expect(ranking!.rows.find((row) => row.isTarget)?.matchScore).toBeNull();
    expect(ranking!.rows.filter((row) => !row.isTarget).every((row) => row.matchScore !== null)).toBe(
      true,
    );
  });

  it("shows the searched profile in a five-profile group", () => {
    const target = profile("searched", 60_000, "Fashion and beauty", 2_000);
    const pool = [target];
    for (let index = 1; index <= 6; index += 1) {
      pool.push(profile(`peer.${index}`, 58_000 + index * 1_000, "Fashion and beauty", 1_900 + index * 20));
    }

    const ranking = buildPeerRanking(target, computeMetrics(target), pool);

    expect(ranking!.rows).toHaveLength(5); // target + four closest peers
    expect(ranking!.total).toBe(5);
    expect(ranking!.rows.filter((row) => row.isTarget)).toHaveLength(1);
  });

  it("returns null when no comparable peer is available", () => {
    const target = profile("solo", 20_000, "Food blogger", 800);
    expect(buildPeerRanking(target, computeMetrics(target), [])).toBeNull();
  });
});
