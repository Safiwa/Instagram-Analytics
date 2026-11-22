import { formatCompact, formatPercent } from "../format";
import type { CreatorProfile } from "../data/types";
import { inferPostActivity, isSimilarCategory } from "./category";
import {
  countryReason,
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
  FOLLOWER_LATENCY,
  isWithinFollowerLatency,
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
  // Post-derived activity (Reels/post captions and hashtags only), never the
  // display name or biography.
  category: string;
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

function followerBand(followers: number): string {
  return `${formatCompact(Math.round(followers * (1 - FOLLOWER_LATENCY)))}–${formatCompact(
    Math.round(followers * (1 + FOLLOWER_LATENCY)),
  )}`;
}

// The Middle East panel is deliberately stricter than the global peer pool:
// every candidate must be inside the ±30% follower band AND share an activity
// inferred only from public Reels/post captions and hashtags. The same filtered
// set feeds the highlighted peer and the ranking table, so they never disagree.
function rankedCandidates(
  target: CreatorProfile,
  metrics: ProfileMetrics,
  pool: CreatorProfile[],
): RegionalPeer[] {
  const targetCountry = inferCountrySignal(target);
  const targetFactors = rankFactors(target, metrics);

  const candidates = pool.filter(
    (candidate) =>
      candidate.username !== target.username &&
      candidate.followers > 0 &&
      candidate.recentPosts.length > 0 &&
      isWithinFollowerLatency(target.followers, candidate.followers) &&
      sharedPostActivity(target, candidate).length > 0,
  );

  return candidates
    .map((candidate) => {
      const candidateMetrics = computeMetrics(candidate);
      const candidateFactors = rankFactors(candidate, candidateMetrics);
      const candidateCountry = inferCountrySignal(candidate);
      const relationship = countryRelationship(targetCountry, candidateCountry);
      const activity = inferPostActivity(candidate);
      const shared = sharedPostActivity(target, candidate);
      const factorScore = rankFactorSimilarity(targetFactors, candidateFactors);
      const activityScore = clamp(75 + shared.length * 10, 0, 100);
      const raw = factorScore * 0.4 + activityScore * 0.35 + countryScore(relationship) * 0.25;

      const matchReasons = [
        `followers within ±${Math.round(FOLLOWER_LATENCY * 100)}% of this profile (${followerBand(target.followers)})`,
        `activity from Reels/post captions and hashtags only: ${shared.join(", ")}`,
        countryReason(relationship, targetCountry, candidateCountry),
        "ranked by 55% followers, 20% engagement, 15% avg interactions, 10% follower change",
      ];

      return {
        profile: candidate,
        metrics: candidateMetrics,
        factors: candidateFactors,
        matchScore: clampRankScoreToMatch(raw),
        category: activity.join(", "),
        sharedActivity: shared,
        country: candidateCountry,
        countryRelationship: relationship,
        matchReasons,
      };
    })
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
      category: inferPostActivity(target).join(", "),
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
