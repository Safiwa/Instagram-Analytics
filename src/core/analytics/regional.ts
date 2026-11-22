import { formatCompact, formatPercent } from "../format";
import type { CreatorProfile } from "../data/types";
import {
  categoryGroup,
  inferCategory,
  inferExplicitCategory,
  inferPostActivity,
  isSimilarCategory,
} from "./category";
import {
  countryRelationship,
  countryScore,
  inferCountrySignal,
  type CountryRelationship,
  type CountrySignal,
} from "./country";
import { computeMetrics, type ProfileMetrics } from "./metrics";
import {
  clampRankScoreToMatch,
  compareRank,
  isWithinFollowerLatency,
  rankFactorSimilarity,
  rankFactors,
  regionalRankScore,
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
  // The visible category comes from the public profile label (display name/bio).
  // Post-derived activity is supporting evidence, never the category gate.
  category: string;
  // True when the candidate's explicit label exactly matches the searched
  // profile's label; otherwise it is only in the same broader creator group.
  sameCategoryLabel: boolean;
  sharedActivity: string[];
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

function sharedPostActivity(target: CreatorProfile, candidate: CreatorProfile): string[] {
  const targetActivity = inferPostActivity(target);
  const candidateActivity = inferPostActivity(candidate);
  return targetActivity.filter((activity) =>
    candidateActivity.some((other) => isSimilarCategory(activity, other)),
  );
}

// The Middle East panel keeps the curated pool and the hard ±30% follower band.
// Category labels decide similarity: both sides must have an explicit public
// creator label in the same creator group, and an exact label match is preferred
// over a merely compatible creator label. Fallback labels do not qualify. Public
// post activity only strengthens the match, so a hotel or news account can no
// longer become a creator peer through its captions.
function rankedCandidates(
  target: CreatorProfile,
  metrics: ProfileMetrics,
  pool: CreatorProfile[],
): RegionalPeer[] {
  const targetCountry = inferCountrySignal(target);
  const targetFactors = rankFactors(target, metrics);
  const targetCategory = inferExplicitCategory(target);

  if (!targetCategory || categoryGroup(targetCategory) !== "creator") {
    return [];
  }

  const candidates = pool.filter((candidate) => {
    const candidateCategory = inferExplicitCategory(candidate);
    return (
      candidate.username !== target.username &&
      candidate.followers > 0 &&
      candidate.recentPosts.length > 0 &&
      isWithinFollowerLatency(target.followers, candidate.followers) &&
      candidateCategory !== null &&
      categoryGroup(candidateCategory) === "creator" &&
      isSimilarCategory(targetCategory, candidateCategory)
    );
  });

  return candidates
    .map((candidate) => {
      const candidateMetrics = computeMetrics(candidate);
      const candidateFactors = rankFactors(candidate, candidateMetrics);
      const candidateCountry = inferCountrySignal(candidate);
      const relationship = countryRelationship(targetCountry, candidateCountry);
      const candidateCategory = inferExplicitCategory(candidate) ?? inferCategory(candidate);
      const sameCategoryLabel = inferExplicitCategory(candidate) === targetCategory;
      const shared = sharedPostActivity(target, candidate);
      const factorScore = rankFactorSimilarity(targetFactors, candidateFactors);
      const activityScore = shared.length > 0 ? clamp(80 + shared.length * 5, 0, 100) : 75;
      const raw = factorScore * 0.55 + countryScore(relationship) * 0.3 + activityScore * 0.15;

      const matchReasons = [
        `${sameCategoryLabel ? "same category label" : "same creator category group"}: ${candidateCategory}`,
        ...(shared.length > 0 ? [`shared activity: ${shared.join(", ")}`] : []),
        `regional fit ${Math.round(factorScore)}%`,
      ];

      return {
        profile: candidate,
        metrics: candidateMetrics,
        factors: candidateFactors,
        matchScore: clampRankScoreToMatch(raw),
        category: candidateCategory,
        sameCategoryLabel,
        sharedActivity: shared,
        country: candidateCountry,
        countryRelationship: relationship,
        matchReasons,
      };
    })
    .sort(
      (left, right) =>
        Number(right.sameCategoryLabel) - Number(left.sameCategoryLabel) ||
        right.matchScore - left.matchScore ||
        regionalRankScore(right.factors, right.metrics.authenticityPct) -
          regionalRankScore(left.factors, left.metrics.authenticityPct) ||
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

function changeValue(value: number | null, estimated: boolean): string {
  return `${formatPercent(value)}${estimated ? " est." : ""}`;
}

// The comparison table mirrors the four public ranking criteria and adds
// authenticity, the disclosed estimate that adjusts the regional rank.
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
    {
      label: "Authenticity",
      target: changeValue(metrics.authenticityPct, metrics.authenticityEstimated),
      peer: changeValue(peer.metrics.authenticityPct, peer.metrics.authenticityEstimated),
      insight: differenceInsight(
        "authenticity",
        metrics.authenticityPct ?? 0,
        peer.metrics.authenticityPct ?? 0,
        " pts",
      ),
    },
  ];
}

export function buildRegionalRanking(
  target: CreatorProfile,
  metrics: ProfileMetrics,
  pool: CreatorProfile[],
  // Four peers plus the searched profile keeps the panel at five rows.
  limit = 4,
): RegionalRanking | null {
  const targetFactors = rankFactors(target, metrics);
  const targetRegionalScore = regionalRankScore(targetFactors, metrics.authenticityPct);
  const peers = [...rankedCandidates(target, metrics, pool)]
    .sort(
      (left, right) =>
        regionalRankScore(right.factors, right.metrics.authenticityPct) -
          regionalRankScore(left.factors, left.metrics.authenticityPct) ||
        right.profile.followers - left.profile.followers ||
        left.profile.username.localeCompare(right.profile.username),
    )
    .slice(0, limit);
  if (peers.length === 0) {
    return null;
  }

  const rows: RegionalRankRow[] = [
    {
      profile: target,
      engagementRate: targetFactors.engagementRate,
      rankScore: targetRegionalScore,
      avgInteractions: targetFactors.avgInteractions,
      followerChangePct: targetFactors.followerChangePct,
      followerChangeEstimated: targetFactors.followerChangeEstimated,
      matchScore: null,
      category: inferExplicitCategory(target) ?? inferCategory(target),
      country: inferCountrySignal(target),
      isTarget: true,
    },
    ...peers.map((peer) => ({
      profile: peer.profile,
      engagementRate: peer.metrics.engagementRate,
      rankScore: regionalRankScore(peer.factors, peer.metrics.authenticityPct),
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

  const beaten = peers.filter(
    (peer) =>
      regionalRankScore(peer.factors, peer.metrics.authenticityPct) < targetRegionalScore,
  ).length;

  return {
    rows,
    targetRank: rows.findIndex((row) => row.isTarget) + 1,
    total: rows.length,
    outperformedPercent: Math.round((beaten / peers.length) * 100),
  };
}
