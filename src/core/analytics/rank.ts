import type { CreatorProfile } from "../data/types";
import { analyzeGrowth } from "./growth";
import type { ProfileMetrics } from "./metrics";

// Followers carry the most weight, then engagement rate, average likes, average
// comments and 30-day follower change. Fixed anchors keep scores comparable
// across refreshes, regions and every ranking surface in the product.
export const RANK_WEIGHTS = {
  followers: 0.55,
  engagement: 0.2,
  avgLikes: 0.1,
  avgComments: 0.05,
  followerChange: 0.1,
} as const;

// The dedicated Middle East and UAE top-ten boards put 70% of the score on
// follower count, then apply the existing relative weights of the remaining
// four signals to the other 30%. Followers stay dominant, while engagement,
// likes, comments and growth still separate similarly sized accounts.
export const COUNTRY_BOARD_FOLLOWER_WEIGHT = 0.7;
const NON_FOLLOWER_WEIGHT_TOTAL =
  RANK_WEIGHTS.engagement +
  RANK_WEIGHTS.avgLikes +
  RANK_WEIGHTS.avgComments +
  RANK_WEIGHTS.followerChange;
export const COUNTRY_BOARD_WEIGHTS = {
  followers: COUNTRY_BOARD_FOLLOWER_WEIGHT,
  engagement:
    (1 - COUNTRY_BOARD_FOLLOWER_WEIGHT) * (RANK_WEIGHTS.engagement / NON_FOLLOWER_WEIGHT_TOTAL),
  avgLikes:
    (1 - COUNTRY_BOARD_FOLLOWER_WEIGHT) * (RANK_WEIGHTS.avgLikes / NON_FOLLOWER_WEIGHT_TOTAL),
  avgComments:
    (1 - COUNTRY_BOARD_FOLLOWER_WEIGHT) * (RANK_WEIGHTS.avgComments / NON_FOLLOWER_WEIGHT_TOTAL),
  followerChange:
    (1 - COUNTRY_BOARD_FOLLOWER_WEIGHT) *
    (RANK_WEIGHTS.followerChange / NON_FOLLOWER_WEIGHT_TOTAL),
} as const;

// The regional profile panel adds a disclosed authenticity term so a profile
// with fewer estimated fake followers can outrank a nearly identical account
// with a weaker audience. A missing authenticity value is not a zero: it is
// excluded from the blend so unavailable data never silently penalizes a real
// profile. Global boards and compare rankings stay five-signal.
export const REGIONAL_AUTHENTICITY_WEIGHT = 0.1;

export type RankFactorInput = {
  followers: number;
  engagementRate: number;
  avgLikes: number;
  avgComments: number;
  followerChangePct: number;
};

export type RankFactors = RankFactorInput & {
  followerChangeEstimated: boolean;
};

// Benchmarks must stay inside a believable audience band. Without this gate a
// profile with thousands of followers could be "benchmarked" against an account
// with millions, which is misleading even though both are real public profiles.
export const COMPARABLE_FOLLOWER_RATIO = 3;
export const COMPARABLE_ENGAGEMENT_MULTIPLIER = 2;
export const COMPARABLE_ENGAGEMENT_PADDING_PCT = 0.5;

// The profile-page Middle East benchmark uses a tighter, hard gate: the peer's
// follower count must sit within ±30% of the searched profile. Unlike
// isComparableRange(), there is no fallback outside this band.
export const FOLLOWER_LATENCY = 0.3;

export function isWithinFollowerLatency(
  targetFollowers: number,
  candidateFollowers: number,
  latency = FOLLOWER_LATENCY,
): boolean {
  if (!Number.isFinite(targetFollowers) || !Number.isFinite(candidateFollowers)) {
    return false;
  }
  if (targetFollowers <= 0 || candidateFollowers <= 0) {
    return false;
  }
  return (
    candidateFollowers >= targetFollowers * (1 - latency) &&
    candidateFollowers <= targetFollowers * (1 + latency)
  );
}

// Peer benchmarks match follower size step by step: ±30% first, then up to 3x,
// then up to 10x larger or smaller, and finally the nearest sizes available.
// The chosen step is returned so the page can say which range was used.
export type FollowerBandStep = "close" | "3x" | "10x" | "nearest";

export type FollowerBand = {
  step: FollowerBandStep;
  min: number;
  max: number;
  label: string;
};

export const NEAREST_BAND_SIZE = 5;

function compactCount(value: number): string {
  if (value >= 1_000_000) {
    return `${round2(value / 1_000_000)}M`;
  }
  if (value >= 1_000) {
    return `${round2(value / 1_000)}K`;
  }
  return String(Math.round(value));
}

function bandRange(min: number, max: number): string {
  return `${compactCount(min)}–${compactCount(max)} followers`;
}

function fixedBands(targetFollowers: number): FollowerBand[] {
  const t = targetFollowers;
  return [
    {
      step: "close",
      min: Math.ceil(t * (1 - FOLLOWER_LATENCY)),
      max: Math.floor(t * (1 + FOLLOWER_LATENCY)),
      label: `Similar size: within ±30% (${bandRange(Math.ceil(t * 0.7), Math.floor(t * 1.3))})`,
    },
    {
      step: "3x",
      min: Math.ceil(t / 3),
      max: Math.floor(t * 3),
      label: `Widened to 3x: no peer within ±30%, compared within ${bandRange(Math.ceil(t / 3), Math.floor(t * 3))}`,
    },
    {
      step: "10x",
      min: Math.ceil(t / 10),
      max: Math.floor(t * 10),
      label: `Widened to 10x: no peer within 3x, compared within ${bandRange(Math.ceil(t / 10), Math.floor(t * 10))}`,
    },
  ];
}

function sizeDistance(target: number, candidate: number): number {
  return Math.abs(Math.log(Math.max(candidate, 1) / Math.max(target, 1)));
}

// Picks the narrowest band that leaves at least one candidate, after the
// caller's own eligibility test. Candidates outside every fixed band fall back
// to the nearest NEAREST_BAND_SIZE sizes, labelled as such.
export function selectFollowerBand<T>(
  targetFollowers: number,
  candidates: readonly T[],
  followersOf: (candidate: T) => number,
  eligibleInBand: (candidate: T, band: FollowerBand) => boolean = () => true,
  // The nearest-size fallback beyond 10x is opt-in. Global peer suggestions
  // keep the 10x ceiling; the Middle East panel opts in and says so.
  options: { allowNearest?: boolean } = {},
): { band: FollowerBand; candidates: T[] } | null {
  const usable = candidates.filter((candidate) => followersOf(candidate) > 0);
  if (targetFollowers <= 0 || usable.length === 0) {
    return null;
  }
  for (const band of fixedBands(targetFollowers)) {
    const inBand = usable.filter((candidate) => {
      const followers = followersOf(candidate);
      return followers >= band.min && followers <= band.max && eligibleInBand(candidate, band);
    });
    if (inBand.length > 0) {
      return { band, candidates: inBand };
    }
  }
  if (!options.allowNearest) {
    return null;
  }
  const nearest = [...usable]
    .sort(
      (left, right) =>
        sizeDistance(targetFollowers, followersOf(left)) -
        sizeDistance(targetFollowers, followersOf(right)),
    )
    .slice(0, NEAREST_BAND_SIZE);
  const sizes = nearest.map(followersOf);
  const min = Math.min(...sizes);
  const max = Math.max(...sizes);
  return {
    band: {
      step: "nearest",
      min,
      max,
      label: `Nearest sizes available: no peer within 10x yet, so the closest tracked accounts are shown (${bandRange(min, max)})`,
    },
    candidates: nearest,
  };
}

export type ComparableRangeInput = Pick<RankFactorInput, "followers" | "engagementRate">;

export function isComparableRange(
  target: ComparableRangeInput,
  candidate: ComparableRangeInput,
): boolean {
  const targetFollowers = Math.max(0, target.followers);
  const candidateFollowers = Math.max(0, candidate.followers);
  if (targetFollowers <= 0 || candidateFollowers <= 0) {
    return false;
  }

  const higherFollowers = Math.max(targetFollowers, candidateFollowers);
  const lowerFollowers = Math.min(targetFollowers, candidateFollowers);
  if (higherFollowers / lowerFollowers > COMPARABLE_FOLLOWER_RATIO) {
    return false;
  }

  const targetRate = Math.max(0, target.engagementRate);
  const candidateRate = Math.max(0, candidate.engagementRate);
  const higherRate = Math.max(targetRate, candidateRate);
  const lowerRate = Math.min(targetRate, candidateRate);

  return higherRate <= lowerRate * COMPARABLE_ENGAGEMENT_MULTIPLIER + COMPARABLE_ENGAGEMENT_PADDING_PCT;
}

// The engagement half of isComparableRange(), for the widened follower bands.
export function isComparableEngagement(targetRate: number, candidateRate: number): boolean {
  const higherRate = Math.max(Math.max(0, targetRate), Math.max(0, candidateRate));
  const lowerRate = Math.min(Math.max(0, targetRate), Math.max(0, candidateRate));
  return higherRate <= lowerRate * COMPARABLE_ENGAGEMENT_MULTIPLIER + COMPARABLE_ENGAGEMENT_PADDING_PCT;
}

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

function scoreComponents(entry: RankFactorInput) {
  return {
    followers: logScore(entry.followers, 200_000_000),
    engagement: clamp((entry.engagementRate / 5) * 100, 0, 100),
    avgLikes: logScore(entry.avgLikes, 2_000_000),
    avgComments: logScore(entry.avgComments, 200_000),
    followerChange: clamp(((entry.followerChangePct + 5) / 20) * 100, 0, 100),
  };
}

export function rankScore(entry: RankFactorInput): number {
  const scores = scoreComponents(entry);

  return round2(
    scores.followers * RANK_WEIGHTS.followers +
      scores.engagement * RANK_WEIGHTS.engagement +
      scores.avgLikes * RANK_WEIGHTS.avgLikes +
      scores.avgComments * RANK_WEIGHTS.avgComments +
      scores.followerChange * RANK_WEIGHTS.followerChange,
  );
}

export function countryBoardRankScore(entry: RankFactorInput): number {
  const scores = scoreComponents(entry);

  return round2(
    scores.followers * COUNTRY_BOARD_WEIGHTS.followers +
      scores.engagement * COUNTRY_BOARD_WEIGHTS.engagement +
      scores.avgLikes * COUNTRY_BOARD_WEIGHTS.avgLikes +
      scores.avgComments * COUNTRY_BOARD_WEIGHTS.avgComments +
      scores.followerChange * COUNTRY_BOARD_WEIGHTS.followerChange,
  );
}

export function regionalRankScore(
  entry: RankFactorInput,
  authenticityPct: number | null,
): number {
  const base = rankScore(entry);
  if (authenticityPct === null || !Number.isFinite(authenticityPct)) {
    return base;
  }
  const authenticity = clamp(authenticityPct, 0, 100);
  return round2(
    base * (1 - REGIONAL_AUTHENTICITY_WEIGHT) + authenticity * REGIONAL_AUTHENTICITY_WEIGHT,
  );
}

export function rankFactors(
  profile: CreatorProfile,
  metrics: ProfileMetrics,
  now = new Date(),
): RankFactors {
  const growth = analyzeGrowth(profile, now);

  return {
    followers: profile.followers,
    engagementRate: metrics.engagementRate,
    avgLikes: round2(metrics.avgLikes),
    avgComments: round2(metrics.avgComments),
    followerChangePct: growth.monthGrowthPct ?? 0,
    followerChangeEstimated: growth.growthEstimated,
  };
}

// Similarity for "bring comparable profiles" uses the same five signals and the
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
  const avgLikes = logGapScore(target.avgLikes, candidate.avgLikes, 45);
  const avgComments = logGapScore(target.avgComments, candidate.avgComments, 45);
  const followerChange = clamp(
    100 - Math.abs(target.followerChangePct - candidate.followerChangePct) * 5,
    0,
    100,
  );

  const weighted =
    followers * RANK_WEIGHTS.followers +
    engagement * RANK_WEIGHTS.engagement +
    avgLikes * RANK_WEIGHTS.avgLikes +
    avgComments * RANK_WEIGHTS.avgComments +
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
// pool", 99 means an almost identical five-signal profile and niche.
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
