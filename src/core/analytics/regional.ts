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
  hasPublishedCountryEvidence,
  inferCountrySignal,
  isMiddleEastCountry,
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
  postsNotExposed: boolean;
  engagementSource: ProfileMetrics["engagementSource"];
};

export type RegionalComparison = {
  peer: RegionalPeer;
  comparisons: KeyComparison[];
};

export type RegionalRankRow = {
  profile: CreatorProfile;
  engagementRate: number;
  rankScore: number;
  avgLikes: number;
  avgComments: number;
  followerChangePct: number;
  followerChangeEstimated: boolean;
  matchScore: number | null;
  category: string;
  country: CountrySignal;
  isTarget: boolean;
  postsNotExposed: boolean;
  engagementSource: ProfileMetrics["engagementSource"];
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

const MAX_COUNTRY_REPEATS = 3;

// The target row is itself part of the five-row benchmark, so its country counts
// toward the three-row limit. Profiles without a published country do not add a
// country to the count.
function capCountryRepeats(
  candidates: RegionalPeer[],
  targetCountry: CountrySignal,
): RegionalPeer[] {
  const counts = new Map<string, number>();
  if (
    targetCountry.country &&
    isMiddleEastCountry(targetCountry.country) &&
    hasPublishedCountryEvidence(targetCountry)
  ) {
    counts.set(targetCountry.country, 1);
  }

  return candidates.filter((candidate) => {
    const country = candidate.country.country;
    if (!country) {
      return false;
    }
    const count = counts.get(country) ?? 0;
    if (count >= MAX_COUNTRY_REPEATS) {
      return false;
    }
    counts.set(country, count + 1);
    return true;
  });
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
  const targetPostsNotExposed = target.recentPosts.length === 0;

  if (!targetCategory || categoryGroup(targetCategory) !== "creator") {
    return [];
  }
  // A known country must be one of the published Middle East countries and must
  // come from public evidence. An unknown target is still allowed: its row is
  // disclosed as "Country not published" and its peers remain evidence-gated.
  if (
    targetCountry.country &&
    (!isMiddleEastCountry(targetCountry.country) ||
      !hasPublishedCountryEvidence(targetCountry))
  ) {
    return [];
  }

  const candidates = pool.filter((candidate) => {
    const candidateCategory = inferExplicitCategory(candidate);
    return (
      candidate.username !== target.username &&
      candidate.followers > 0 &&
      // A no-post searched profile may be ranked alongside other no-post
      // accounts, but never against invented activity. Their rows are disclosed.
      (targetPostsNotExposed || candidate.recentPosts.length > 0) &&
      isWithinFollowerLatency(target.followers, candidate.followers) &&
      candidateCategory !== null &&
      categoryGroup(candidateCategory) === "creator" &&
      isSimilarCategory(targetCategory, candidateCategory)
    );
  });

  const ranked = candidates
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

      const postsNotExposed = candidate.recentPosts.length === 0;
      const matchReasons = [
        `${sameCategoryLabel ? "same category label" : "same creator category group"}: ${candidateCategory}`,
        ...(shared.length > 0 ? [`shared activity: ${shared.join(", ")}`] : []),
        `regional fit ${Math.round(factorScore)}%`,
        ...(postsNotExposed ? ["posts not exposed; public signals only"] : []),
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
        postsNotExposed,
        engagementSource: candidateMetrics.engagementSource,
      };
    })
    .filter(
      (peer) =>
        peer.country.country !== null &&
        isMiddleEastCountry(peer.country.country) &&
        hasPublishedCountryEvidence(peer.country),
    );

  ranked.sort(
    (left, right) =>
      Number(right.sameCategoryLabel) - Number(left.sameCategoryLabel) ||
      right.matchScore - left.matchScore ||
      regionalRankScore(right.factors, right.metrics.authenticityPct) -
        regionalRankScore(left.factors, left.metrics.authenticityPct) ||
      left.profile.username.localeCompare(right.profile.username),
  );

  // Apply the country cap after ranking so the strongest eligible peer in each
  // country keeps its place; later profiles from that country are skipped.
  return capCountryRepeats(ranked, targetCountry);
}

export function findRegionalCategoryPeer(
  target: CreatorProfile,
  metrics: ProfileMetrics,
  pool: CreatorProfile[],
): RegionalPeer | null {
  const candidates = rankedCandidates(target, metrics, pool);
  // The headline comparison card should show a profile with visible activity
  // whenever one exists; no-post accounts belong in the disclosed rank table.
  return candidates.find((candidate) => !candidate.postsNotExposed) ?? candidates[0] ?? null;
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

// The comparison table mirrors the five public ranking signals and adds
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
      label: "Avg likes",
      target: formatCompact(targetFactors.avgLikes),
      peer: formatCompact(peer.factors.avgLikes),
      insight: differenceInsight("average likes", targetFactors.avgLikes, peer.factors.avgLikes),
    },
    {
      label: "Avg comments",
      target: formatCompact(targetFactors.avgComments),
      peer: formatCompact(peer.factors.avgComments),
      insight: differenceInsight(
        "average comments",
        targetFactors.avgComments,
        peer.factors.avgComments,
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

function regionalScore(peer: RegionalPeer): number {
  return regionalRankScore(peer.factors, peer.metrics.authenticityPct);
}

// Most profiles use the strongest four real peers. A searched profile with no
// exposed posts scores from public signals only, so the strongest-four rule can
// hide the genuinely comparable lower-scoring accounts. Bracket that score with
// two higher and two lower real peers instead; the rows remain ordered by score.
function selectRegionalPeers(
  candidates: RegionalPeer[],
  targetScore: number,
  limit: number,
  targetPostsNotExposed: boolean,
): RegionalPeer[] {
  const byScore = [...candidates].sort(
    (left, right) =>
      regionalScore(right) - regionalScore(left) ||
      left.profile.username.localeCompare(right.profile.username),
  );

  if (!targetPostsNotExposed) {
    return byScore.slice(0, limit);
  }

  const higher = byScore.filter((peer) => regionalScore(peer) > targetScore);
  const lower = byScore
    .filter((peer) => regionalScore(peer) <= targetScore)
    .sort((left, right) => regionalScore(right) - regionalScore(left));
  const upperCount = Math.ceil(limit / 2);
  const lowerCount = limit - upperCount;
  const selected = [...higher.slice(0, upperCount), ...lower.slice(0, lowerCount)];
  const seen = new Set(selected.map((peer) => peer.profile.username));
  const remaining = byScore
    .filter((peer) => !seen.has(peer.profile.username))
    .sort(
      (left, right) =>
        Math.abs(regionalScore(left) - targetScore) - Math.abs(regionalScore(right) - targetScore),
    );
  return [...selected, ...remaining].slice(0, limit);
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
  const peers = selectRegionalPeers(
    rankedCandidates(target, metrics, pool),
    targetRegionalScore,
    limit,
    target.recentPosts.length === 0,
  );
  if (peers.length === 0) {
    return null;
  }

  const rows: RegionalRankRow[] = [
    {
      profile: target,
      engagementRate: targetFactors.engagementRate,
      rankScore: targetRegionalScore,
      avgLikes: targetFactors.avgLikes,
      avgComments: targetFactors.avgComments,
      followerChangePct: targetFactors.followerChangePct,
      followerChangeEstimated: targetFactors.followerChangeEstimated,
      matchScore: null,
      category: inferExplicitCategory(target) ?? inferCategory(target),
      country: inferCountrySignal(target),
      isTarget: true,
      postsNotExposed: target.recentPosts.length === 0,
      engagementSource: metrics.engagementSource,
    },
    ...peers.map((peer) => ({
      profile: peer.profile,
      engagementRate: peer.metrics.engagementRate,
      rankScore: regionalRankScore(peer.factors, peer.metrics.authenticityPct),
      avgLikes: peer.factors.avgLikes,
      avgComments: peer.factors.avgComments,
      followerChangePct: peer.factors.followerChangePct,
      followerChangeEstimated: peer.factors.followerChangeEstimated,
      matchScore: peer.matchScore,
      category: peer.category,
      country: peer.country,
      isTarget: false,
      postsNotExposed: peer.postsNotExposed,
      engagementSource: peer.engagementSource,
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
