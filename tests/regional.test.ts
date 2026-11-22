import { describe, expect, it } from "vitest";
import { computeMetrics } from "../src/core/analytics/metrics";
import {
  buildKeyComparisons,
  buildRegionalRanking,
  findRegionalCategoryPeer,
} from "../src/core/analytics/regional";
import type { CreatorProfile, Post } from "../src/core/data/types";

function post(likes: number, hashtags: string[] = []): Post {
  return {
    id: `p-${likes}-${hashtags.join("-")}`,
    type: "Reel",
    caption: hashtags.join(" "),
    postedAt: new Date("2026-11-20T00:00:00.000Z").toISOString(),
    likes,
    comments: 50,
    hashtags,
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

  it("always scores an in-range regional match at 80% or higher", () => {
    const target = profile("small.uae", 1_000, "Food blogger in Abu Dhabi", 100);
    const inRange = profile("near.food.uae", 1_200, "Food blogger and chef in Dubai", 120);
    const huge = profile("big.food.uae", 2_300_000, "Food blogger and chef in Dubai", 50_000);

    const match = findRegionalCategoryPeer(target, computeMetrics(target), [huge, inRange]);

    expect(match?.profile.username).toBe("near.food.uae");
    expect(match!.matchScore).toBeGreaterThanOrEqual(80);
    expect(match!.matchScore).toBeLessThanOrEqual(99);
  });

  it("never benchmarks a micro account against a million-follower brand", () => {
    const target = profile("small.uae", 1_000, "Food blogger in Abu Dhabi", 100);
    const huge = profile("big.food.uae", 2_300_000, "Food blogger and chef in Dubai", 50_000);

    // The highlighted benchmark stays range-gated and returns no misleading peer.
    expect(findRegionalCategoryPeer(target, computeMetrics(target), [huge])).toBeNull();
    // The leaderboard still shows a full rank group, ordered by the four factors.
    const ranking = buildRegionalRanking(target, computeMetrics(target), [huge]);
    expect(ranking?.rows).toHaveLength(2);
    expect(ranking!.rows[0].profile.username).toBe("big.food.uae");
  });

  it("reports the audience range in the match reasons", () => {
    const target = profile("dubai.style", 60_000, "Fashion and beauty", 2_000);
    const peer = profile("uae.close", 70_000, "Fashion and beauty", 2_100);

    const match = findRegionalCategoryPeer(target, computeMetrics(target), [peer]);

    expect(match!.matchReasons.join(" ")).toContain("similar audience size and engagement range");
  });

  it("excludes profiles from unrelated categories", () => {
    const target = profile("cafe.uae", 10_000, "Food blogger and chef in Dubai", 300);
    const airline = profile("emirates", 9_000_000, "Fly Better airline travel", 5_000_000);
    const news = profile("gulfnews", 1_400_000, "The no.1 news brand in the UAE", 4_000);

    expect(findRegionalCategoryPeer(target, computeMetrics(target), [airline, news])).toBeNull();
    expect(buildRegionalRanking(target, computeMetrics(target), [airline, news])).toBeNull();
  });

  it("prefers a peer in the same country inferred from the handle", () => {
    const target = profile("dubai.style", 60_000, "Fashion and beauty", 2_000);
    const sameCountry = profile("uae.creator", 40_000, "Fashion and beauty", 1_500);
    const otherCountry = profile("doha.creator", 80_000, "Fashion and beauty", 2_500);

    const match = findRegionalCategoryPeer(target, computeMetrics(target), [
      otherCountry,
      sameCountry,
    ]);

    expect(match?.profile.username).toBe("uae.creator");
    expect(match?.country.country).toBe("United Arab Emirates");
    expect(match?.matchReasons.join(" ")).toContain("same country");
  });

  it("falls back to hashtag and promoted-location signals when the handle has no country", () => {
    const target = {
      ...profile("style.studio", 60_000, "Fashion and beauty", 2_000),
      recentPosts: [post(2_000, ["#Dubai", "#Beauty"]), post(1_800, ["#UAE"])],
    };
    const sameCountry = profile("beauty.dubai", 40_000, "Fashion and beauty", 1_500);
    const otherCountry = profile("beauty.paris", 80_000, "Fashion and beauty", 2_500);

    const match = findRegionalCategoryPeer(target, computeMetrics(target), [
      otherCountry,
      sameCountry,
    ]);

    expect(match?.profile.username).toBe("beauty.dubai");
    expect(match?.country.basis).toBe("handle");
  });

  it("returns null for an empty regional pool", () => {
    const target = profile("solo.uae", 1_000, "Local cafe", 100);
    expect(findRegionalCategoryPeer(target, computeMetrics(target), [])).toBeNull();
  });
});

describe("four key regional comparisons", () => {
  it("covers the same four criteria used for ranking", () => {
    const target = profile("target.uae", 60_000, "Fashion and beauty", 2_000, false);
    const peer = profile("peer.uae", 75_000, "Fashion and makeup", 1_800, true);
    const match = findRegionalCategoryPeer(target, computeMetrics(target), [peer])!;

    const comparisons = buildKeyComparisons(target, computeMetrics(target), match);

    expect(comparisons.map((row) => row.label)).toEqual([
      "Followers",
      "Engagement rate",
      "Avg interactions",
      "Follower change",
    ]);
    expect(comparisons.length).toBe(4);
    expect(comparisons[0].target).toBe("60K");
    expect(comparisons[2].target).toBe("2.1K");
    expect(comparisons[3].target).toContain("est.");
  });
});

describe("UAE/GCC top peer ranking", () => {
  it("includes the searched profile, ranks by four factors and supports a top-10 limit", () => {
    const target = profile("target.uae", 60_000, "Fashion and beauty", 2_000);
    const pool = [target];
    for (let i = 1; i <= 12; i += 1) {
      pool.push(
        profile(`peer.${i}`, 60_000 + i * 1_000, "Fashion and beauty", 1_800 + i * 20),
      );
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
    const scores = ranking!.rows.map((row) => row.rankScore);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(ranking!.rows[0].rankScore).toBeGreaterThan(ranking!.rows[1].rankScore);
  });

  it("ranks out-of-band peers by score but never suggests them as benchmarks", () => {
    const target = profile("rank.target", 50_000, "Fashion and beauty", 500);
    const highRate = profile("high.er", 5_000, "Fashion and beauty", 1_000);
    const balanced = profile("balanced.peer", 100_000_000, "Fashion and beauty", 1_000_000);

    expect(findRegionalCategoryPeer(target, computeMetrics(target), [highRate, balanced])).toBeNull();

    const ranking = buildRegionalRanking(target, computeMetrics(target), [highRate, balanced])!;
    expect(ranking.rows).toHaveLength(3);
    const balancedRow = ranking.rows.find((row) => row.profile.username === "balanced.peer")!;
    const highRow = ranking.rows.find((row) => row.profile.username === "high.er")!;
    expect(balancedRow.rankScore).toBeGreaterThan(highRow.rankScore);
    expect(ranking.rows.indexOf(balancedRow)).toBeLessThan(ranking.rows.indexOf(highRow));
  });

  it("ranks in-range peers by four-factor score", () => {
    const target = profile("rank.target", 50_000, "Fashion and beauty", 500);
    const low = profile("low.peer", 55_000, "Fashion and beauty", 300);
    const high = profile("high.peer", 60_000, "Fashion and beauty", 900);

    const ranking = buildRegionalRanking(target, computeMetrics(target), [low, high])!;
    const scores = ranking.rows.map((row) => row.rankScore);

    expect(ranking.rows.map((row) => row.profile.username)[0]).toBe("high.peer");
    expect(ranking.rows[ranking.rows.length - 1].profile.username).toBe("low.peer");
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("returns null when no regional peers are available", () => {
    const target = profile("solo.uae", 1_000, "Local cafe", 100);
    expect(buildRegionalRanking(target, computeMetrics(target), [])).toBeNull();
  });
});
