import { describe, expect, it } from "vitest";
import { computeMetrics } from "../src/core/analytics/metrics";
import { rankFactors, rankScore } from "../src/core/analytics/rank";
import {
  buildKeyComparisons,
  buildRegionalRanking,
  findRegionalCategoryPeer,
} from "../src/core/analytics/regional";
import { isMiddleEastProfile } from "../src/core/data/regional";
import type { CreatorProfile, Post } from "../src/core/data/types";

const POSTED_AT = "2026-11-20T00:00:00.000Z";

function post(id: string, caption: string, likes: number, hashtags: string[] = []): Post {
  return {
    id,
    type: "Reel",
    caption,
    postedAt: POSTED_AT,
    likes,
    comments: Math.round(likes * 0.1),
    hashtags,
  };
}

function profile(
  username: string,
  followers: number,
  captions: string[],
  options: { displayName?: string; bio?: string; likes?: number } = {},
): CreatorProfile {
  const likes = options.likes ?? 2_000;
  return {
    username,
    displayName: options.displayName ?? username,
    category: "Instagram Professional",
    bio: options.bio ?? "",
    followers,
    following: 100,
    postsCount: captions.length,
    isVerified: false,
    source: "live",
    followerHistory: [],
    recentPosts: captions.map((caption, index) => post(`${username}-${index}`, caption, likes)),
  };
}

describe("Middle East regional pool", () => {
  it("uses the Middle East board, which includes the dedicated UAE accounts", () => {
    expect(isMiddleEastProfile("hudabeauty")).toBe(true);
    expect(isMiddleEastProfile("qatarairways")).toBe(true);
    expect(isMiddleEastProfile("visitqatar")).toBe(true);
    expect(isMiddleEastProfile("emirates")).toBe(true);
    expect(isMiddleEastProfile("selenagomez")).toBe(false);
    expect(isMiddleEastProfile("gucci")).toBe(false);
  });
});

describe("Middle East activity peer", () => {
  it("infers activity only from Reels/post captions and hashtags", () => {
    const target = profile("target", 1_000_000, ["Grammy award and red carpet poetry"]);
    const misleading = profile("misleading", 1_100_000, ["Airline flight and hotel tourism"], {
      displayName: "Grammy award red carpet poet",
      bio: "Actor singer poetry festival",
    });
    const truthful = profile("truthful", 900_000, ["Grammy award and red carpet poetry"], {
      displayName: "",
      bio: "",
    });

    const match = findRegionalCategoryPeer(target, computeMetrics(target), [misleading, truthful]);

    expect(match?.profile.username).toBe("truthful");
    expect(match?.sharedActivity.join(" ")).toContain("Public figure");
  });

  it("includes the ±30% follower band and rejects profiles outside it", () => {
    const target = profile("target", 1_000_000, ["festival poetry"]);
    const low = profile("low", 700_000, ["festival poetry"]);
    const high = profile("high", 1_300_000, ["festival poetry"]);
    const tooLow = profile("too.low", 699_999, ["festival poetry"]);
    const tooHigh = profile("too.high", 1_300_001, ["festival poetry"]);
    const pool = [tooHigh, tooLow, high, low];

    const match = findRegionalCategoryPeer(target, computeMetrics(target), pool);
    const ranking = buildRegionalRanking(target, computeMetrics(target), pool);
    const visible = ranking?.rows.map((row) => row.profile.username) ?? [];

    expect(["low", "high"]).toContain(match?.profile.username);
    expect(visible).toContain("low");
    expect(visible).toContain("high");
    expect(visible).not.toContain("too.low");
    expect(visible).not.toContain("too.high");
  });

  it("returns no peer and no rank table when every candidate is outside the band", () => {
    const target = profile("target", 1_000_000, ["festival poetry"]);
    const far = profile("far", 2_000_000, ["festival poetry"]);

    expect(findRegionalCategoryPeer(target, computeMetrics(target), [far])).toBeNull();
    expect(buildRegionalRanking(target, computeMetrics(target), [far])).toBeNull();
  });

  it("discloses the follower band, post-only activity match and four-factor weights", () => {
    const target = profile("target", 1_000_000, ["festival poetry"]);
    const peer = profile("peer", 1_100_000, ["festival poetry"]);

    const match = findRegionalCategoryPeer(target, computeMetrics(target), [peer])!;
    const reasons = match.matchReasons.join(" ");

    expect(reasons).toContain("±30%");
    expect(reasons).toContain("700K–1.3M");
    expect(reasons).toContain("Reels/post captions and hashtags only");
    expect(reasons).toContain("55% followers, 20% engagement, 15% avg interactions, 10% follower change");
  });

  it("returns null for an empty regional pool", () => {
    const target = profile("solo", 1_000, ["festival poetry"]);
    expect(findRegionalCategoryPeer(target, computeMetrics(target), [])).toBeNull();
    expect(buildRegionalRanking(target, computeMetrics(target), [])).toBeNull();
  });
});

describe("four key regional comparisons", () => {
  it("covers the same four criteria used for ranking", () => {
    const target = profile("target", 1_000_000, ["festival poetry"]);
    const peer = profile("peer", 1_100_000, ["festival poetry"], { likes: 1_800 });
    const match = findRegionalCategoryPeer(target, computeMetrics(target), [peer])!;

    const comparisons = buildKeyComparisons(target, computeMetrics(target), match);

    expect(comparisons.map((row) => row.label)).toEqual([
      "Followers",
      "Engagement rate",
      "Avg interactions",
      "Follower change",
    ]);
    expect(comparisons[0].target).toBe("1M");
    expect(comparisons[3].target).toContain("est.");
  });
});

describe("Middle East four-factor ranking", () => {
  it("orders eligible profiles by the 55/20/15/10 rank score", () => {
    const target = profile("target", 1_000_000, ["festival poetry"]);
    const low = profile("low", 800_000, ["festival poetry"], { likes: 500 });
    const balanced = profile("balanced", 1_000_000, ["festival poetry"], { likes: 3_000 });
    const high = profile("high", 1_200_000, ["festival poetry"], { likes: 9_000 });
    const peers = [high, low, balanced];

    const ranking = buildRegionalRanking(target, computeMetrics(target), [target, ...peers])!;
    const scores = ranking.rows.map((row) => row.rankScore);
    const expectedPeers = [...peers]
      .map((candidate) => ({
        username: candidate.username,
        score: rankScore(rankFactors(candidate, computeMetrics(candidate))),
      }))
      .sort((left, right) => right.score - left.score)
      .map((entry) => entry.username);

    expect(scores).toEqual([...scores].sort((left, right) => right - left));
    expect(ranking.rows.filter((row) => !row.isTarget).map((row) => row.profile.username)).toEqual(
      expectedPeers,
    );
    expect(ranking.total).toBe(4);
  });

  it("supports a top-10 limit after the band and activity filters", () => {
    const target = profile("target", 1_000_000, ["festival poetry"]);
    const pool = [target];
    for (let index = 1; index <= 12; index += 1) {
      pool.push(
        profile(`peer.${index}`, 900_000 + index * 10_000, ["festival poetry"], {
          likes: 1_000 + index * 100,
        }),
      );
    }

    const ranking = buildRegionalRanking(target, computeMetrics(target), pool);

    expect(ranking?.rows).toHaveLength(11); // target + top 10 peers
    expect(ranking?.total).toBe(11);
    expect(ranking!.rows.filter((row) => row.isTarget)).toHaveLength(1);
  });
});
