import type { CreatorProfile } from "../data/types";
import { inferCategory } from "./category";
import {
  countryRelationship,
  countryTier,
  inferCountrySignal,
  type CountryRelationship,
  type CountrySignal,
} from "./country";
import { computeMetrics } from "./metrics";
import { compareRank, rankFactors, rankScore } from "./rank";

// Other real public profiles in the first compared account's country or wider
// region. Unlike audience-matched suggestions these rows are not range-gated:
// they are a ranking, ordered with the same five signals as every other board.
export type CompareRankRow = {
  profile: CreatorProfile;
  rankScore: number;
  engagementRate: number;
  avgLikes: number;
  avgComments: number;
  followerChangePct: number;
  followerChangeEstimated: boolean;
  category: string;
  country: CountrySignal;
  countryRelationship: CountryRelationship;
};

function normalizeExcludedHandle(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

export function buildCompareRanking(
  target: CreatorProfile,
  pool: CreatorProfile[],
  excluded: Iterable<string> = [],
  limit = 4,
): CompareRankRow[] {
  const excludedHandles = new Set<string>([normalizeExcludedHandle(target.username)]);
  for (const value of excluded) {
    const handle = normalizeExcludedHandle(value);
    if (handle) {
      excludedHandles.add(handle);
    }
  }

  const targetCategory = inferCategory(target);
  const targetCountry = inferCountrySignal(target);

  const rows = pool
    .filter(
      (candidate) =>
        !excludedHandles.has(normalizeExcludedHandle(candidate.username)) &&
        candidate.followers > 0 &&
        candidate.recentPosts.length > 0 &&
        inferCategory(candidate) === targetCategory,
    )
    .map((candidate) => {
      const factors = rankFactors(candidate, computeMetrics(candidate));
      const country = inferCountrySignal(candidate);
      const relationship = countryRelationship(targetCountry, country);
      return {
        profile: candidate,
        rankScore: rankScore(factors),
        engagementRate: factors.engagementRate,
        avgLikes: factors.avgLikes,
        avgComments: factors.avgComments,
        followerChangePct: factors.followerChangePct,
        followerChangeEstimated: factors.followerChangeEstimated,
        category: inferCategory(candidate),
        country,
        countryRelationship: relationship,
      };
    })
    .filter(
      (row) =>
        row.countryRelationship === "same-country" || row.countryRelationship === "same-region",
    );

  // Same-country benchmarks lead; same-region profiles fill the remaining rows.
  // Within each tier the shared weighted score decides the order.
  rows.sort(
    (left, right) =>
      countryTier(left.countryRelationship) - countryTier(right.countryRelationship) ||
      compareRank(left, right),
  );

  return rows.slice(0, limit);
}
