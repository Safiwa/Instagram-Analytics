import type { CreatorProfile } from "../data/types";
import { analyzeGrowth } from "./growth";
import type { ProfileMetrics } from "./metrics";

// Followers carry the most weight, then engagement rate, average interactions and
// 30-day follower change. Fixed anchors keep scores comparable across refreshes,
// regions and every ranking surface in the product.
export const RANK_WEIGHTS = {
  followers: 0.55,
  engagement: 0.2,
  interactions: 0.15,
  followerChange: 0.1,
} as const;

export type RankFactorInput = {
  followers: number;
  engagementRate: number;
  avgInteractions: number;
  followerChangePct: number;
};

export type RankFactors = RankFactorInput & {
  followerChangeEstimated: boolean;
};

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function logScore(value: number, ceiling: number): number {
  if (value <= 0) {
    return 0;
  }
  return clamp((Math.log10(value) / Math.log10(ceiling)) * 100, 0, 100);
}

export function rankScore(entry: RankFactorInput): number {
  const followers = logScore(entry.followers, 200_000_000);
  const engagement = clamp((entry.engagementRate / 5) * 100, 0, 100);
  const interactions = logScore(entry.avgInteractions, 2_000_000);
  const followerChange = clamp(((entry.followerChangePct + 5) / 20) * 100, 0, 100);

  return round2(
    followers * RANK_WEIGHTS.followers +
      engagement * RANK_WEIGHTS.engagement +
      interactions * RANK_WEIGHTS.interactions +
      followerChange * RANK_WEIGHTS.followerChange,
  );
}

export function rankFactors(
  profile: CreatorProfile,
  metrics: ProfileMetrics,
  now = new Date(),
): RankFactors {
  const growth = analyzeGrowth(profile, now);
  const avgInteractions = round2(
    metrics.avgLikes + metrics.avgComments + (metrics.avgSaves ?? 0),
  );

  return {
    followers: profile.followers,
    engagementRate: metrics.engagementRate,
    avgInteractions,
    followerChangePct: growth.monthGrowthPct ?? 0,
    followerChangeEstimated: growth.growthEstimated,
  };
}

// Similarity for "bring comparable profiles" uses the same four factors and the
// same weights as the visible ranking, so the suggested peers and their rank
// never disagree about what "comparable" means.
export function rankFactorSimilarity(target: RankFactors, candidate: RankFactors): number {
  const logGapScore = (left: number, right: number, penalty: number) => {
    const gap = Math.abs(
      Math.log10(Math.max(left, 1)) - Math.log10(Math.max(right, 1)),
    );
    return clamp(100 - gap * penalty, 0, 100);
  };

  const followers = logGapScore(target.followers, candidate.followers, 55);
  const engagement = clamp(
    100 - Math.abs(target.engagementRate - candidate.engagementRate) * 25,
    0,
    100,
  );
  const interactions = logGapScore(target.avgInteractions, candidate.avgInteractions, 45);
  const followerChange = clamp(
    100 - Math.abs(target.followerChangePct - candidate.followerChangePct) * 5,
    0,
    100,
  );

  const weighted =
    followers * RANK_WEIGHTS.followers +
    engagement * RANK_WEIGHTS.engagement +
    interactions * RANK_WEIGHTS.interactions +
    followerChange * RANK_WEIGHTS.followerChange;

  const overallGap = Math.abs(rankScore(target) - rankScore(candidate));
  return round2(clamp(100 - overallGap * 2, 0, 100) * 0.4 + weighted * 0.6);
}

type RankComparable = {
  rankScore: number;
  followers?: number;
  username?: string;
  profile?: { username: string; followers: number };
};

function comparableUsername(row: RankComparable): string {
  return row.username ?? row.profile?.username ?? "";
}

function comparableFollowers(row: RankComparable): number {
  return row.followers ?? row.profile?.followers ?? 0;
}

// Regional match scores are deliberately relative: 80 means "in this curated
// pool", 99 means an almost identical four-factor profile and niche.
export function clampRankScoreToMatch(rawScore: number): number {
  return 80 + Math.round((19 * clamp(rawScore, 0, 100)) / 100);
}

export function compareRank(left: RankComparable, right: RankComparable): number {
  return (
    right.rankScore - left.rankScore ||
    comparableFollowers(right) - comparableFollowers(left) ||
    comparableUsername(left).localeCompare(comparableUsername(right))
  );
}
