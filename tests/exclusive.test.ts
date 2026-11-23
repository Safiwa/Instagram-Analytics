import { describe, expect, it } from "vitest";
import { inferCountrySignal, type CountryRelationship } from "../src/core/analytics/country";
import {
  dedupeProfileBenchmarks,
  excludedExclusiveHandles,
  type ProfileBenchmarks,
} from "../src/core/analytics/exclusive";
import { computeMetrics } from "../src/core/analytics/metrics";
import { rankFactors } from "../src/core/analytics/rank";
import type { PeerMatch, PeerRankingRow } from "../src/core/analytics/peer";
import { buildRegionalRanking, type RegionalPeer, type RegionalRankRow } from "../src/core/analytics/regional";
import type { CreatorProfile, Post } from "../src/core/data/types";

const NOW = new Date("2026-11-22T12:00:00.000Z");

function post(id: string): Post {
  return {
    id,
    type: "Reel",
    caption: "",
    postedAt: new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    likes: 1_000,
    comments: 50,
    hashtags: [],
  };
}

function profile(username: string, followers: number): CreatorProfile {
  return {
    username,
    displayName: username,
    category: "Instagram Professional",
    bio: "Dubai lifestyle creator",
    followers,
    following: 100,
    postsCount: 20,
    isVerified: false,
    source: "live",
    followerHistory: [],
    recentPosts: [post(`${username}-1`), post(`${username}-2`)],
  };
}

function peerMatch(candidate: CreatorProfile, score: number): PeerMatch {
  const metrics = computeMetrics(candidate);
  return {
    profile: candidate,
    metrics,
    factors: rankFactors(candidate, metrics, NOW),
    score,
    category: "Content creator",
    country: inferCountrySignal(candidate),
    countryRelationship: "same-country" as CountryRelationship,
    reasons: [],
  };
}

function regionalPeer(candidate: CreatorProfile, score: number): RegionalPeer {
  const metrics = computeMetrics(candidate);
  return {
    profile: candidate,
    metrics,
    factors: rankFactors(candidate, metrics, NOW),
    matchScore: score,
    category: "Content creator",
    sameCategoryLabel: true,
    sharedActivity: [],
    country: inferCountrySignal(candidate),
    countryRelationship: "same-country" as CountryRelationship,
    matchReasons: [],
    postsNotExposed: candidate.recentPosts.length === 0,
    engagementSource: metrics.engagementSource,
  };
}

function peerRow(candidate: CreatorProfile, isTarget: boolean, matchScore: number | null, rankScore: number): PeerRankingRow {
  return {
    profile: candidate,
    engagementRate: computeMetrics(candidate).engagementRate,
    rankScore,
    avgLikes: 450,
    avgComments: 50,
    followerChangePct: 2,
    followerChangeEstimated: true,
    matchScore,
    category: "Content creator",
    country: inferCountrySignal(candidate),
    isTarget,
    postsNotExposed: candidate.recentPosts.length === 0,
    engagementSource: "public-posts",
  };
}

function regionalRow(candidate: CreatorProfile, isTarget: boolean, matchScore: number | null, rankScore: number): RegionalRankRow {
  return {
    ...peerRow(candidate, isTarget, matchScore, rankScore),
  };
}

function benchmarks(options: {
  peer?: CreatorProfile | null;
  peerScore?: number;
  regionalPeer?: CreatorProfile | null;
  regionalScore?: number;
  keep?: "ola.alqodmani" | "trending.vibz.uae";
}): ProfileBenchmarks {
  const target = profile("hudabeauty", 56_200_000);
  const ola = profile("ola.alqodmani", 51_500);
  const trending = profile("trending.vibz.uae", 58_900);
  const preferred = options.keep === "ola.alqodmani" ? ola : trending;
  const dropped = options.keep === "ola.alqodmani" ? trending : ola;
  const rankScoreFor = (candidate: CreatorProfile) => (candidate.username === ola.username ? 37.2 : 46.6);
  const matchScoreFor = (candidate: CreatorProfile) =>
    candidate.username === preferred.username ? 90 : 80;

  return {
    peer: options.peer ? peerMatch(options.peer, options.peerScore ?? 70) : null,
    ranking: {
      rows: [
        peerRow(target, true, null, 66.8),
        peerRow(preferred, false, matchScoreFor(preferred), rankScoreFor(preferred)),
        peerRow(dropped, false, matchScoreFor(dropped), rankScoreFor(dropped)),
      ],
      targetRank: 1,
      total: 3,
      outperformedPercent: 100,
    },
    regionalPeer: options.regionalPeer
      ? regionalPeer(options.regionalPeer, options.regionalScore ?? 94)
      : null,
    regionalRanking: {
      rows: [
        regionalRow(target, true, null, 66.8),
        regionalRow(preferred, false, matchScoreFor(preferred), rankScoreFor(preferred)),
        regionalRow(dropped, false, matchScoreFor(dropped), rankScoreFor(dropped)),
      ],
      targetRank: 1,
      total: 3,
      outperformedPercent: 100,
    },
  };
}

function allVisibleHandles(result: ProfileBenchmarks): string[] {
  return [
    ...(result.peer ? [result.peer.profile.username] : []),
    ...(result.ranking?.rows.map((row) => row.profile.username) ?? []),
    ...(result.regionalPeer ? [result.regionalPeer.profile.username] : []),
    ...(result.regionalRanking?.rows.map((row) => row.profile.username) ?? []),
  ];
}

describe("exclusive peer groups", () => {
  it("keeps only one of Ola Al Qodmani and trending.vibz.uae across all benchmark surfaces", () => {
    const ola = profile("ola.alqodmani", 51_500);
    const trending = profile("trending.vibz.uae", 58_900);
    const result = dedupeProfileBenchmarks(
      benchmarks({ peer: trending, peerScore: 73, regionalPeer: ola, regionalScore: 80 }),
    );

    expect(allVisibleHandles(result)).not.toContain("ola.alqodmani");
    expect(allVisibleHandles(result)).toContain("trending.vibz.uae");
    expect(result.peer?.profile.username).toBe("trending.vibz.uae");
    expect(result.regionalPeer).toBeNull();
  });

  it("keeps the better-scoring member when Ola wins the match", () => {
    const ola = profile("ola.alqodmani", 51_500);
    const trending = profile("trending.vibz.uae", 58_900);
    const result = dedupeProfileBenchmarks(
      benchmarks({ peer: ola, peerScore: 88, regionalPeer: trending, regionalScore: 70, keep: "ola.alqodmani" }),
    );

    expect(allVisibleHandles(result)).not.toContain("trending.vibz.uae");
    expect(allVisibleHandles(result)).toContain("ola.alqodmani");
    expect(result.regionalPeer).toBeNull();
  });

  it("drops the other exclusive member when the searched profile is in the group", () => {
    const target = profile("trending.vibz.uae", 58_900);
    const duplicate = profile("ola.alqodmani", 51_500);
    const independent = profile("donya_esmailiii", 70_000);
    const input: ProfileBenchmarks = {
      peer: peerMatch(duplicate, 95),
      ranking: {
        rows: [
          peerRow(target, true, null, 50),
          peerRow(duplicate, false, 95, 40),
          peerRow(independent, false, 80, 45),
        ],
        targetRank: 2,
        total: 3,
        outperformedPercent: 50,
      },
      regionalPeer: regionalPeer(duplicate, 95),
      regionalRanking: {
        rows: [
          regionalRow(target, true, null, 50),
          regionalRow(duplicate, false, 95, 40),
          regionalRow(independent, false, 80, 45),
        ],
        targetRank: 2,
        total: 3,
        outperformedPercent: 50,
      },
    };

    const result = dedupeProfileBenchmarks(input);

    expect(allVisibleHandles(result)).not.toContain("ola.alqodmani");
    expect(allVisibleHandles(result)).toContain("trending.vibz.uae");
    expect(result.peer).toBeNull();
    expect(result.regionalPeer).toBeNull();
    expect(result.ranking?.rows.map((row) => row.profile.username)).toEqual([
      "trending.vibz.uae",
      "donya_esmailiii",
    ]);
    expect(result.regionalRanking?.total).toBe(2);
  });

  it("removes the duplicate before ranking so the panel keeps five rows", () => {
    const target = profile("ola.alqodmani", 51_557);
    target.displayName = "Ola Al Qodmani";
    target.bio = "Travel Creator";
    const duplicate = profile("trending.vibz.uae", 58_980);
    duplicate.displayName = "Hadia Nashed";
    duplicate.bio = "Content Creator";
    // Make the duplicate the strongest regional peer so it lands in the top four.
    duplicate.recentPosts = [post("duplicate-1"), post("duplicate-2")].map((item) => ({
      ...item,
      likes: 8_000,
      comments: 800,
    }));

    const peers = [
      profile("dina_h_ussien", 59_963),
      profile("poojaabis", 58_197),
      profile("dina.ak", 60_264),
      profile("anshi_pandyala_official", 65_744),
    ];
    const pool = [target, duplicate, ...peers];
    const initial = buildRegionalRanking(target, computeMetrics(target), pool);

    expect(initial?.total).toBe(5);
    expect(initial?.rows.some((row) => row.profile.username === "trending.vibz.uae")).toBe(true);

    const excluded = excludedExclusiveHandles({
      peer: null,
      ranking: null,
      regionalPeer: null,
      regionalRanking: initial,
    });
    expect(excluded.has("trending.vibz.uae")).toBe(true);

    const rebuilt = buildRegionalRanking(
      target,
      computeMetrics(target),
      pool.filter((item) => !excluded.has(item.username.toLowerCase())),
    );

    expect(rebuilt?.total).toBe(5);
    expect(rebuilt?.rows.some((row) => row.profile.username === "trending.vibz.uae")).toBe(false);
    expect(rebuilt?.rows.filter((row) => row.isTarget)).toHaveLength(1);
  });

  it("recomputes ranking totals after removing the duplicate", () => {
    const trending = profile("trending.vibz.uae", 58_900);
    const result = dedupeProfileBenchmarks(benchmarks({ peer: trending }));

    expect(result.ranking?.rows).toHaveLength(2);
    expect(result.ranking?.total).toBe(2);
    expect(result.ranking?.targetRank).toBe(1);
    expect(result.ranking?.outperformedPercent).toBe(100);
    expect(result.regionalRanking?.rows).toHaveLength(2);
    expect(result.regionalRanking?.total).toBe(2);
  });

  it("leaves benchmarks untouched when only one group member is present", () => {
    const target = profile("hudabeauty", 56_200_000);
    const trending = profile("trending.vibz.uae", 58_900);
    const input: ProfileBenchmarks = {
      peer: peerMatch(trending, 73),
      ranking: {
        rows: [peerRow(target, true, null, 66.8), peerRow(trending, false, 90, 46.6)],
        targetRank: 1,
        total: 2,
        outperformedPercent: 100,
      },
      regionalPeer: regionalPeer(trending, 94),
      regionalRanking: {
        rows: [regionalRow(target, true, null, 66.8), regionalRow(trending, false, 94, 46.6)],
        targetRank: 1,
        total: 2,
        outperformedPercent: 100,
      },
    };
    const result = dedupeProfileBenchmarks(input);

    expect(result.ranking?.rows).toHaveLength(2);
    expect(setVisibleHandles(result)).toEqual(setVisibleHandles(input));
  });
});

function setVisibleHandles(result: ProfileBenchmarks): Set<string> {
  return new Set(allVisibleHandles(result));
}
