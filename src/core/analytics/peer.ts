import type { CreatorProfile } from "../data/types";
import { inferCategory, inferExplicitCategory, isSimilarCategory } from "./category";
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
import {
  compareRank,
  isComparableRange,
  rankFactorSimilarity,
  rankFactors,
  rankScore,
  round2,
  type RankFactors,
} from "./rank";

const TOPIC_KEYWORDS: Record<string, string[]> = {
  fashion: ["fashion", "style", "outfit", "clothing", "beauty", "makeup", "skincare"],
  food: ["food", "chef", "recipe", "cooking", "restaurant", "cafe", "kitchen"],
  travel: ["travel", "trip", "wander", "adventure", "destination", "tourism"],
  fitness: ["fitness", "gym", "workout", "training", "wellness", "health"],
  business: ["business", "entrepreneur", "brand", "marketing", "startup", "ceo"],
  technology: ["tech", "technology", "software", "digital", "ai", "code", "gadget"],
  photography: ["photograph", "photo", "camera", "visual", "film"],
  music: ["music", "singer", "song", "band", "dj", "musician"],
  sport: ["football", "soccer", "cricket", "sport", "athlete", "nba", "f1"],
  nature: ["nature", "wildlife", "animal", "planet", "earth", "environment"],
  family: ["family", "kids", "parenting", "mom", "dad"],
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function profileTopics(profile: CreatorProfile): Set<string> {
  const postText = profile.recentPosts
    .flatMap((post) => [post.caption, ...post.hashtags])
    .join(" ");
  const text = `${profile.displayName} ${profile.category} ${profile.bio} ${postText}`.toLowerCase();
  const topics = new Set<string>();

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      topics.add(topic);
    }
  }

  return topics;
}

function overlap(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((topic) => right.has(topic));
}

export type PeerMatch = {
  profile: CreatorProfile;
  metrics: ProfileMetrics;
  factors: RankFactors;
  score: number;
  category: string;
  country: CountrySignal;
  countryRelationship: CountryRelationship;
  reasons: string[];
};

type ScoreOptions = {
  // Suggestions/benchmarks enforce a believable audience band. Ranking tables
  // opt out so the searched profile always appears in a full five-profile group.
  requireComparableRange?: boolean;
  // Suggestions keep only the best country tier. Rank tables keep same-country
  // peers first, then fill remaining rows from the next tiers.
  fillCountryTiers?: boolean;
};

function scorePeers(
  target: CreatorProfile,
  metrics: ProfileMetrics,
  pool: CreatorProfile[],
  options: ScoreOptions = {},
): PeerMatch[] {
  const requireComparableRange = options.requireComparableRange !== false;
  const fillCountryTiers = options.fillCountryTiers === true;
  const explicitTargetCategory = inferExplicitCategory(target);
  const targetCategory = explicitTargetCategory ?? inferCategory(target);
  const requireExplicitCandidate = explicitTargetCategory !== null;
  const targetCountry = inferCountrySignal(target);
  const targetTopics = profileTopics(target);
  const targetFactors = rankFactors(target, metrics);
  const candidates = pool.filter(
    (candidate) =>
      candidate.username !== target.username &&
      candidate.followers > 0 &&
      candidate.recentPosts.length > 0 &&
      (!requireExplicitCandidate || inferExplicitCategory(candidate) !== null) &&
      isSimilarCategory(targetCategory, inferCategory(candidate)),
  );

  if (candidates.length === 0) {
    return [];
  }

  const scored = candidates
    .map((candidate) => {
      const candidateCategory = inferCategory(candidate);
      const candidateMetrics = computeMetrics(candidate);
      const candidateFactors = rankFactors(candidate, candidateMetrics);
      return { candidate, candidateCategory, candidateMetrics, candidateFactors };
    })
    // A suggested benchmark must sit in the same audience-size and engagement
    // band. Category and country fit cannot excuse a 1K vs 10M gap. Ranking
    // tables keep all category peers so the five-profile group stays visible.
    .filter(
      ({ candidateFactors }) =>
        !requireComparableRange || isComparableRange(targetFactors, candidateFactors),
    )
    .map(({ candidate, candidateCategory, candidateMetrics, candidateFactors }) => {
      const candidateCountry = inferCountrySignal(candidate);
      const relationship = countryRelationship(targetCountry, candidateCountry);
      const sharedTopics = overlap(targetTopics, profileTopics(candidate));
      const topicScore = sharedTopics.length > 0 ? clamp(60 + sharedTopics.length * 20, 0, 100) : 0;
      const factorScore = rankFactorSimilarity(targetFactors, candidateFactors);
      const exactCategory = candidateCategory === targetCategory;

      // Weighted signal fit, category fit, country fit and themes all contribute.
      // The country tier filter below makes same-country candidates win whenever
      // they exist; the score then orders them by the same criteria as the ranking.
      const score = round2(
        factorScore * 0.35 +
          topicScore * 0.15 +
          countryScore(relationship) * 0.25 +
          (exactCategory ? 100 : 75) * 0.25,
      );
      const reasons: string[] = [];

      reasons.push(
        exactCategory ? `${candidateCategory} category` : `similar ${candidateCategory} category`,
      );
      reasons.push(countryReason(relationship, targetCountry, candidateCountry));
      if (requireComparableRange) {
        reasons.push("similar audience size and engagement range");
      }
      reasons.push(
        `five-factor fit ${Math.round(factorScore)}% (followers, engagement, likes, comments, follower change)`,
      );
      if (sharedTopics.length > 0) {
        reasons.push(`shares ${sharedTopics.slice(0, 2).join(" and ")} themes`);
      }

      return {
        profile: candidate,
        metrics: candidateMetrics,
        factors: candidateFactors,
        score,
        category: candidateCategory,
        country: candidateCountry,
        countryRelationship: relationship,
        reasons,
      };
    });

  // A same-country match is always preferred over a merely similar region, an
  // unknown country, or a clearly different country. If none exists, fall back
  // through those tiers instead of returning no suggestions.
  const bestTier = Math.min(...scored.map((match) => countryTier(match.countryRelationship)));
  const sorted = scored.sort(
    (left, right) => right.score - left.score || left.profile.username.localeCompare(right.profile.username),
  );
  if (!fillCountryTiers) {
    return sorted.filter((match) => countryTier(match.countryRelationship) === bestTier);
  }

  // Same-country peers lead the five-profile table, but a thin local tier must
  // not shorten it. Remaining rows come from the next country tiers in order.
  return [
    ...sorted.filter((match) => countryTier(match.countryRelationship) === bestTier),
    ...sorted.filter((match) => countryTier(match.countryRelationship) !== bestTier),
  ];
}

export function findClosestPeer(
  target: CreatorProfile,
  metrics: ProfileMetrics,
  pool: CreatorProfile[],
): PeerMatch | null {
  return findSimilarPeers(target, metrics, pool, 1)[0] ?? null;
}

// Used by the compare page for same-country suggestions. The caller filters out
// handles already in the comparison before rendering.
export function findSimilarPeers(
  target: CreatorProfile,
  metrics: ProfileMetrics,
  pool: CreatorProfile[],
  limit = 4,
): PeerMatch[] {
  return scorePeers(target, metrics, pool, { requireComparableRange: true }).slice(0, limit);
}

export type PeerRankingRow = {
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
};

export type PeerRanking = {
  rows: PeerRankingRow[];
  targetRank: number;
  total: number;
  outperformedPercent: number | null;
};

// Builds a five-profile leaderboard: the searched profile plus its four closest
// category peers. Unlike the benchmark suggestions this table is not range-gated,
// so the rank group stays visible even for unusually large or small accounts.
export function buildPeerRanking(
  target: CreatorProfile,
  metrics: ProfileMetrics,
  pool: CreatorProfile[],
  limit = 4,
): PeerRanking | null {
  const peers = scorePeers(target, metrics, pool, {
    requireComparableRange: false,
    fillCountryTiers: true,
  }).slice(0, limit);
  if (peers.length === 0) {
    return null;
  }

  const targetFactors = rankFactors(target, metrics);
  const rows: PeerRankingRow[] = [
    {
      profile: target,
      engagementRate: targetFactors.engagementRate,
      rankScore: rankScore(targetFactors),
      avgLikes: targetFactors.avgLikes,
      avgComments: targetFactors.avgComments,
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
      avgLikes: peer.factors.avgLikes,
      avgComments: peer.factors.avgComments,
      followerChangePct: peer.factors.followerChangePct,
      followerChangeEstimated: peer.factors.followerChangeEstimated,
      matchScore: peer.score,
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
