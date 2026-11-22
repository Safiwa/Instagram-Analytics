import { formatCompact, formatPercent } from "../format";
import type { CreatorProfile } from "../data/types";
import { inferCategory, isSimilarCategory } from "./category";
import {
  countryReason,
  countryRelationship,
  countryScore,
  countryTier,
  inferCountrySignal,
  type CountryRelationship,
  type CountrySignal,
} from "./country";
import { computeMetrics, type ProfileMetrics } from "./metrics";
import { profileTopics } from "./peer";
import {
  clampRankScoreToMatch,
  compareRank,
  isComparableRange,
  rankFactorSimilarity,
  rankFactors,
  rankScore,
  type RankFactors,
} from "./rank";

export type KeyComparison = {
  label: string;
  target: string;
  peer: string;
  insight: string;
};

export type RegionalPeer = {
  profile: CreatorProfile;
  metrics: ProfileMetrics;
  factors: RankFactors;
  matchScore: number;
  category: string;
  sharedBusiness: string[];
  country: CountrySignal;
  countryRelationship: CountryRelationship;
  matchReasons: string[];
};

export type RegionalComparison = {
  peer: RegionalPeer;
  comparisons: KeyComparison[];
};

export type RegionalRankRow = {
  profile: CreatorProfile;
  engagementRate: number;
  rankScore: number;
  avgInteractions: number;
  followerChangePct: number;
  followerChangeEstimated: boolean;
  matchScore: number | null;
  category: string;
  country: CountrySignal;
  isTarget: boolean;
};

export type RegionalRanking = {
  rows: RegionalRankRow[];
  targetRank: number;
  total: number;
  outperformedPercent: number | null;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function sharedTopics(target: CreatorProfile, candidate: CreatorProfile): string[] {
  const candidateTopics = profileTopics(candidate);
  return [...profileTopics(target)].filter((topic) => candidateTopics.has(topic));
}

function rankedCandidates(
  target: CreatorProfile,
  metrics: ProfileMetrics,
  pool: CreatorProfile[],
): RegionalPeer[] {
  const targetCategory = inferCategory(target);
  const targetCountry = inferCountrySignal(target);
  const targetFactors = rankFactors(target, metrics);
  const candidates = pool.filter(
    (candidate) =>
      candidate.username !== target.username &&
      candidate.followers > 0 &&
      candidate.recentPosts.length > 0 &&
      isSimilarCategory(targetCategory, inferCategory(candidate)),
  );

  const scored = candidates
    .map((candidate) => {
      const candidateCategory = inferCategory(candidate);
      const candidateMetrics = computeMetrics(candidate);
      const candidateFactors = rankFactors(candidate, candidateMetrics);
      return { candidate, candidateCategory, candidateMetrics, candidateFactors };
    })
    // Keep UAE/GCC benchmarks inside one audience band: a micro account must not
    // be compared with a million-follower regional brand just because both are local.
    .filter(({ candidateFactors }) => isComparableRange(targetFactors, candidateFactors))
    .map(({ candidate, candidateCategory, candidateMetrics, candidateFactors }) => {
      const candidateCountry = inferCountrySignal(candidate);
      const relationship = countryRelationship(targetCountry, candidateCountry);
      const shared = sharedTopics(target, candidate);
      const topicScore = shared.length > 0 ? clamp(70 + shared.length * 10, 0, 100) : 45;
      const factorScore = rankFactorSimilarity(targetFactors, candidateFactors);
      const exactCategory = candidateCategory === targetCategory;
      const raw =
        factorScore * 0.35 +
        topicScore * 0.15 +
        countryScore(relationship) * 0.25 +
        (exactCategory ? 100 : 75) * 0.25;

      const matchReasons = [
        countryReason(relationship, targetCountry, candidateCountry),
        "similar audience size and engagement range",
        `four-factor fit ${Math.round(factorScore)}% (followers, engagement, interactions, follower change)`,
        exactCategory ? `${candidateCategory} category` : `similar ${candidateCategory} category`,
      ];
      if (shared.length > 0) {
        matchReasons.push(`shares ${shared.slice(0, 2).join(" and ")} themes`);
      }

      return {
        profile: candidate,
        metrics: candidateMetrics,
        factors: candidateFactors,
        matchScore: clampRankScoreToMatch(raw),
        category: candidateCategory,
        sharedBusiness: shared,
        country: candidateCountry,
        countryRelationship: relationship,
        matchReasons,
      };
    });

  const bestTier = Math.min(...scored.map((match) => countryTier(match.countryRelationship)));
  return scored
    .filter((match) => countryTier(match.countryRelationship) === bestTier)
    .sort(
      (left, right) =>
        right.matchScore - left.matchScore ||
        rankScore(right.factors) - rankScore(left.factors) ||
        left.profile.username.localeCompare(right.profile.username),
    );
}

export function findRegionalCategoryPeer(
  target: CreatorProfile,
  metrics: ProfileMetrics,
  pool: CreatorProfile[],
): RegionalPeer | null {
  return rankedCandidates(target, metrics, pool)[0] ?? null;
}

function differenceInsight(
  label: string,
  targetValue: number,
  peerValue: number,
  suffix = "",
): string {
  if (targetValue === peerValue) {
    return `Same ${label.toLowerCase()} as this peer`;
  }
  const higher = targetValue > peerValue;
  const amount = `${Math.abs(targetValue - peerValue).toFixed(2)}${suffix}`;
  return `${amount} ${higher ? "higher" : "lower"} for this profile`;
}

function changeValue(value: number, estimated: boolean): string {
  return `${formatPercent(value)}${estimated ? " est." : ""}`;
}

// The comparison table mirrors the four criteria used to rank the regional
// leaderboard, including the disclosed follower-change estimate.
export function buildKeyComparisons(
  target: CreatorProfile,
  metrics: ProfileMetrics,
  peer: RegionalPeer,
): KeyComparison[] {
  const targetFactors = rankFactors(target, metrics);
  const audienceRatio =
    target.followers >= peer.profile.followers
      ? target.followers / Math.max(peer.profile.followers, 1)
      : peer.profile.followers / Math.max(target.followers, 1);

  return [
    {
      label: "Followers",
      target: formatCompact(target.followers),
      peer: formatCompact(peer.profile.followers),
      insight: `${audienceRatio.toFixed(1)}x ${target.followers >= peer.profile.followers ? "larger" : "smaller"} audience`,
    },
    {
      label: "Engagement rate",
      target: formatPercent(metrics.engagementRate),
      peer: formatPercent(peer.metrics.engagementRate),
      insight: differenceInsight("engagement", metrics.engagementRate, peer.metrics.engagementRate, " pts"),
    },
    {
      label: "Avg interactions",
      target: formatCompact(targetFactors.avgInteractions),
      peer: formatCompact(peer.factors.avgInteractions),
      insight: differenceInsight(
        "average interactions",
        targetFactors.avgInteractions,
        peer.factors.avgInteractions,
      ),
    },
    {
      label: "Follower change",
      target: changeValue(targetFactors.followerChangePct, targetFactors.followerChangeEstimated),
      peer: changeValue(peer.factors.followerChangePct, peer.factors.followerChangeEstimated),
      insight: differenceInsight(
        "follower change",
        targetFactors.followerChangePct,
        peer.factors.followerChangePct,
        " pts",
      ),
    },
  ];
}

export function buildRegionalRanking(
  target: CreatorProfile,
  metrics: ProfileMetrics,
  pool: CreatorProfile[],
  limit = 10,
): RegionalRanking | null {
  // The leaderboard itself is a top-ten by the four-factor score, not by the
  // softer "closest profile" match score used for the single highlighted peer.
  const peers = [...rankedCandidates(target, metrics, pool)]
    .sort(
      (left, right) =>
        rankScore(right.factors) - rankScore(left.factors) ||
        right.profile.followers - left.profile.followers ||
        left.profile.username.localeCompare(right.profile.username),
    )
    .slice(0, limit);
  if (peers.length === 0) {
    return null;
  }

  const targetFactors = rankFactors(target, metrics);
  const rows: RegionalRankRow[] = [
    {
      profile: target,
      engagementRate: targetFactors.engagementRate,
      rankScore: rankScore(targetFactors),
      avgInteractions: targetFactors.avgInteractions,
      followerChangePct: targetFactors.followerChangePct,
      followerChangeEstimated: targetFactors.followerChangeEstimated,
      matchScore: null,
      category: inferCategory(target),
      country: inferCountrySignal(target),
      isTarget: true,
    },
    ...peers.map((peer) => ({
      profile: peer.profile,
      engagementRate: peer.metrics.engagementRate,
      rankScore: rankScore(peer.factors),
      avgInteractions: peer.factors.avgInteractions,
      followerChangePct: peer.factors.followerChangePct,
      followerChangeEstimated: peer.factors.followerChangeEstimated,
      matchScore: peer.matchScore,
      category: peer.category,
      country: peer.country,
      isTarget: false,
    })),
  ];

  rows.sort((left, right) => compareRank(left, right));

  const targetRankScore = rankScore(targetFactors);
  const beaten = peers.filter((peer) => rankScore(peer.factors) < targetRankScore).length;

  return {
    rows,
    targetRank: rows.findIndex((row) => row.isTarget) + 1,
    total: rows.length,
    outperformedPercent: Math.round((beaten / peers.length) * 100),
  };
}
