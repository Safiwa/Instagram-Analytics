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
    const fashion = profile("fashion.uae", 75_000, "Fashion and beauty daily looks", 2_100);
    const footballer = profile("cristiano", 680_000_000, "Football player", 5_000_000);

    const match = findClosestPeer(target, computeMetrics(target), [footballer, fashion]);

    expect(match?.profile.username).toBe("fashion.uae");
    expect(match?.reasons.join(" ")).toContain("fashion");
    expect(match?.score).toBeGreaterThan(0);
  });

  it("ignores fallback category labels when the target has an explicit label", () => {
    const target = profile("rimo.style", 300_000, "Beauty skincare creator", 2_000);
    const fallback = profile(
      "qatar",
      280_000,
      "Qatar through the eyes of its people.",
      1_900,
    );
    const explicit = profile("beauty.peer", 290_000, "Beauty makeup reviews", 2_100);

    const match = findClosestPeer(target, computeMetrics(target), [fallback, explicit]);

    expect(match?.profile.username).toBe("beauty.peer");
  });

  it("excludes the target itself and handles an empty pool", () => {
    const target = profile("solo", 20_000, "Food blogger", 800);

    expect(findClosestPeer(target, computeMetrics(target), [])).toBeNull();
    expect(findClosestPeer(target, computeMetrics(target), [target])).toBeNull();
  });

  it("does not fall back to another country when the target has an inferred country", () => {
    const target = profile("dubai.target", 60_000, "Fashion and beauty", 2_000);
    const london = profile("london.peer", 65_000, "Fashion and beauty", 2_200);
    const unknown = profile("unknown.peer", 62_000, "Fashion and beauty", 2_100);

    expect(findClosestPeer(target, computeMetrics(target), [london, unknown])).toBeNull();
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
    expect(suggestions[0].reasons.join(" ")).toContain("five-factor fit");
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
  it("includes the searched profile and ranks the group by weighted score", () => {
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
    expect(ranking!.rows.every((row) => typeof row.avgLikes === "number")).toBe(true);
    expect(ranking!.rows.every((row) => typeof row.avgComments === "number")).toBe(true);
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

  it("does not mix lower country tiers when same-country peers exist", () => {
    const target = profile("dubai.target", 60_000, "Fashion and beauty", 2_000);
    const pool = [
      target,
      profile("uae.peer1", 61_000, "Fashion and beauty", 2_100),
      profile("uae.peer2", 62_000, "Fashion and beauty", 2_200),
      profile("london.peer1", 58_000, "Fashion and beauty", 1_900),
      profile("paris.peer1", 59_000, "Fashion and beauty", 2_050),
      profile("tokyo.peer1", 57_000, "Fashion and beauty", 1_800),
    ];

    const ranking = buildPeerRanking(target, computeMetrics(target), pool);
    const usernames = ranking!.rows.map((row) => row.profile.username);

    expect(usernames).toEqual(
      expect.arrayContaining(["dubai.target", "uae.peer1", "uae.peer2"]),
    );
    expect(usernames).not.toContain("london.peer1");
    expect(usernames).not.toContain("paris.peer1");
    expect(usernames).not.toContain("tokyo.peer1");
    expect(ranking!.total).toBe(3);
  });

  it("returns null when no same-country peer exists for a known-country profile", () => {
    const target = profile("dubai.target", 60_000, "Fashion and beauty", 2_000);
    const london = profile("london.peer", 65_000, "Fashion and beauty", 2_200);
    const unknown = profile("unknown.peer", 62_000, "Fashion and beauty", 2_100);

    expect(buildPeerRanking(target, computeMetrics(target), [target, london, unknown])).toBeNull();
  });

  it("uses the nearest country tier only when the target country is not published", () => {
    const target = profile("najet.dh", 60_000, "Fashion and beauty", 2_000);
    const sameRegion = profile("uae.peer", 61_000, "Fashion and beauty", 2_100);
    const differentCountry = profile("london.peer", 62_000, "Fashion and beauty", 2_200);
    const unknown = profile("unknown.peer", 63_000, "Fashion and beauty", 2_300);

    const ranking = buildPeerRanking(target, computeMetrics(target), [
      target,
      sameRegion,
      differentCountry,
      unknown,
    ]);
    const usernames = ranking!.rows.map((row) => row.profile.username);

    expect(usernames).toContain("uae.peer");
    expect(usernames).not.toContain("london.peer");
    expect(usernames).not.toContain("unknown.peer");
  });

  it("falls back to inferred creator labels only when explicit peers are scarce", () => {
    const target = profile("dubai.target", 60_000, "Fashion and beauty", 2_000);
    const explicit = profile("uae.explicit", 61_000, "Beauty skincare reviews", 2_100);
    const inferred = profile("uae.inferred", 62_000, "", 2_200);
    const business = profile("uae.brand", 63_000, "", 2_300);
    business.bio = "Retail mall and shopping offers";

    const strict = findClosestPeer(target, computeMetrics(target), [target, inferred]);
    expect(strict).toBeNull();

    const ranking = buildPeerRanking(target, computeMetrics(target), [
      target,
      explicit,
      inferred,
      business,
    ]);
    const usernames = ranking!.rows.map((row) => row.profile.username);

    expect(usernames).toContain("uae.explicit");
    expect(usernames).toContain("uae.inferred");
    expect(usernames).not.toContain("uae.brand");
  });

  it("returns null when no comparable peer is available", () => {
    const target = profile("solo", 20_000, "Food blogger", 800);
    expect(buildPeerRanking(target, computeMetrics(target), [])).toBeNull();
  });
});
