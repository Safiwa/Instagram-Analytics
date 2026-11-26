import type { CreatorProfile } from "../data/types";
import {
  categoryGroup,
  inferCategory,
  inferExplicitCategory,
  isSimilarCategory,
} from "./category";
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
import { joinDateSimilarity, joinedLabel as firstPostLabel } from "./accountAge";
import {
  compareRank,
  isComparableEngagement,
  selectFollowerBand,
  type FollowerBand,
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
  // The follower range the match came from. Absent for ranking tables, which
  // keep every category peer.
  band?: FollowerBand;
  // The peer's first public post ("First post Nov 2026"), when every post is visible.
  joinedLabel?: string;
};

type ScoreOptions = {
  // Suggestions/benchmarks enforce a believable audience band. Ranking tables
  // opt out so the searched profile always appears in a full five-profile group.
  requireComparableRange?: boolean;
  // Restrict the closest-peer card and its ranking table to accounts with the
  // same inferred country. When public data exposes no country signal there is
  // nothing to match, so the best available tier is used instead.
  requireSameCountry?: boolean;
  // Keep only the best country tier. Both suggestions and rank tables use this
  // so a thin local group never gets padded with weaker country matches.
  fillCountryTiers?: boolean;
  // Rank tables may fall back to inferred creator-group labels only when there
  // are not enough explicitly labeled peers. Benchmark suggestions never do.
  allowInferredCandidates?: boolean;
};

function scorePeers(
  target: CreatorProfile,
  metrics: ProfileMetrics,
  pool: CreatorProfile[],
  options: ScoreOptions = {},
): PeerMatch[] {
  const requireComparableRange = options.requireComparableRange !== false;
  const targetCountry = inferCountrySignal(target);
  const requireSameCountry =
    options.requireSameCountry === true && targetCountry.country !== null;
  const fillCountryTiers = options.fillCountryTiers === true;
  const explicitTargetCategory = inferExplicitCategory(target);
  const targetCategory = explicitTargetCategory ?? inferCategory(target);
  const requireExplicitCandidate = explicitTargetCategory !== null && !options.allowInferredCandidates;
  const targetTopics = profileTopics(target);
  const targetFactors = rankFactors(target, metrics);
  const candidates = pool.filter((candidate) => {
    const candidateCategory = inferCategory(candidate);
    const candidateCountry = inferCountrySignal(candidate);
    const hasExplicitCandidate = inferExplicitCategory(candidate) !== null;
    const inferredCreatorFallback =
      options.allowInferredCandidates === true &&
      categoryGroup(targetCategory) === "creator" &&
      categoryGroup(candidateCategory) === "creator";

    return (
      candidate.username !== target.username &&
      candidate.followers > 0 &&
      candidate.recentPosts.length > 0 &&
      (!requireExplicitCandidate || hasExplicitCandidate || inferredCreatorFallback) &&
      isSimilarCategory(targetCategory, candidateCategory) &&
      (!requireSameCountry || candidateCountry.country === targetCountry.country)
    );
  });

  if (candidates.length === 0) {
    return [];
  }

  const prepared = candidates.map((candidate) => {
    const candidateCategory = inferCategory(candidate);
    const candidateMetrics = computeMetrics(candidate);
    const candidateFactors = rankFactors(candidate, candidateMetrics);
    return { candidate, candidateCategory, candidateMetrics, candidateFactors };
  });

  // A suggested benchmark must sit in a believable audience-size band. Bands
  // widen step by step (±30%, 3x, 10x, then nearest sizes) and the band used is
  // reported. Ranking tables keep all category peers so the group stays visible.
  let band: FollowerBand | undefined;
  let inRange = prepared;
  if (requireComparableRange) {
    const selection = selectFollowerBand(
      target.followers,
      prepared,
      (item) => item.candidate.followers,
      (item) => isComparableEngagement(targetFactors.engagementRate, item.candidateFactors.engagementRate),
    );
    if (!selection) {
      return [];
    }
    band = selection.band;
    inRange = selection.candidates;
  }

  const scored = inRange
    .map(({ candidate, candidateCategory, candidateMetrics, candidateFactors }) => {
      const candidateCountry = inferCountrySignal(candidate);
      const relationship = countryRelationship(targetCountry, candidateCountry);
      const sharedTopics = overlap(targetTopics, profileTopics(candidate));
      const topicScore = sharedTopics.length > 0 ? clamp(60 + sharedTopics.length * 20, 0, 100) : 0;
      const factorScore = rankFactorSimilarity(targetFactors, candidateFactors);
      const exactCategory = candidateCategory === targetCategory;
      const joinScore = joinDateSimilarity(target, candidate);
      const joinedLabel = firstPostLabel(candidate);

      // Weighted signal fit, category fit, country fit and themes all contribute.
      // The first-public-post date is a small soft weight, used only when both
      // accounts show every post they have published. The country tier filter below makes same-country
      // candidates win whenever they exist.
      const score = round2(
        factorScore * (joinScore === null ? 0.35 : 0.27) +
          (joinScore ?? 0) * (joinScore === null ? 0 : 0.08) +
          topicScore * 0.15 +
          countryScore(relationship) * 0.25 +
          (exactCategory ? 100 : 75) * 0.25,
      );
      const reasons: string[] = [];

      reasons.push(
        exactCategory ? `${candidateCategory} category` : `similar ${candidateCategory} category`,
      );
      reasons.push(countryReason(relationship, targetCountry, candidateCountry));
      if (band) {
        reasons.push(
          band.step === "close"
            ? "similar audience size (within ±30%) and engagement range"
            : band.step === "nearest"
              ? "nearest audience size available"
              : `audience size within ${band.step} and similar engagement`,
        );
      }
      if (joinScore !== null && joinScore >= 75 && joinedLabel) {
        reasons.push(`started posting around the same time (${joinedLabel.toLowerCase()})`);
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
        ...(band ? { band } : {}),
        ...(joinedLabel ? { joinedLabel } : {}),
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

  // Kept for callers that explicitly opt in; the profile rank table does not.
  // Mixing lower country tiers into a thin local group would make the rank look
  // broader than the public evidence supports.
  return [
    ...sorted.filter((match) => countryTier(match.countryRelationship) === bestTier),
    ...sorted.filter((match) => countryTier(match.countryRelationship) !== bestTier),
  ];
}

// Used by the profile benchmark card. Unlike compare suggestions, the closest
// peer must be in the searched profile's inferred country when one is known.
export function findClosestPeer(
  target: CreatorProfile,
  metrics: ProfileMetrics,
  pool: CreatorProfile[],
): PeerMatch | null {
  return (
    scorePeers(target, metrics, pool, {
      requireComparableRange: true,
      requireSameCountry: true,
    })[0] ?? null
  );
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
  postsNotExposed: boolean;
  engagementSource: ProfileMetrics["engagementSource"];
  // Why a row outside the main rule was added to complete five profiles.
  fill?: RankFill;
};

// Rank tables aim for five profiles. Peers come from the same country and a
// similar category; when the pool has fewer, rows are filled only from the same
// region and category group, and each such row says so.
export type RankFill = "same-region" | "country-limit";

export const RANK_FILL_LABEL: Record<RankFill, string> = {
  "same-region": "same category from a neighbouring country, added to complete the table",
  "country-limit": "same category, added beyond 3 per country to complete the table",
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
// When the searched profile has an inferred country, every ranked peer must come
// from that same country; the fallback tiers only apply when none is published.
export function buildPeerRanking(
  target: CreatorProfile,
  metrics: ProfileMetrics,
  pool: CreatorProfile[],
  limit = 4,
): PeerRanking | null {
  const options = {
    requireComparableRange: false,
    requireSameCountry: true,
    fillCountryTiers: false,
  } as const;
  let peers: (PeerMatch & { fill?: RankFill })[] = scorePeers(target, metrics, pool, options).slice(
    0,
    limit,
  );
  const targetCountry = inferCountrySignal(target);
  const targetCategory = inferExplicitCategory(target) ?? inferCategory(target);
  // Each fill row is labelled by what actually differs from the main rule.
  const fillFor = (): RankFill => "same-region";
  const add = (extra: PeerMatch[], fill: boolean) => {
    if (peers.length >= limit) {
      return;
    }
    const seen = new Set(peers.map((peer) => peer.profile.username));
    const fresh = extra
      .filter((peer) => !seen.has(peer.profile.username))
      .slice(0, limit - peers.length)
      .map((peer) => (fill ? { ...peer, fill: fillFor() } : peer));
    peers = [...peers, ...fresh];
  };

  // Explicit public labels remain the rule. Only when that leaves gaps do we
  // admit inferred creator-group labels, and only to fill the remaining rows.
  add(scorePeers(target, metrics, pool, { ...options, allowInferredCandidates: true }), false);

  // Still short of five: fill only from the same region and the same category
  // group (e.g. a Saudi agency for a UAE agency), marked as such. Other
  // countries and other categories are never used; the table shows fewer rows.
  const anyCountry = {
    ...options,
    requireSameCountry: false,
    fillCountryTiers: true,
    allowInferredCandidates: true,
  };
  const wider = scorePeers(target, metrics, pool, anyCountry);
  if (targetCountry.country !== null) {
    add(
      wider.filter(
        (peer) =>
          peer.countryRelationship === "same-region" && isSimilarCategory(targetCategory, peer.category),
      ),
      true,
    );
  }

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
      postsNotExposed: target.recentPosts.length === 0,
      engagementSource: metrics.engagementSource,
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
      ...(peer.fill ? { fill: peer.fill } : {}),
      postsNotExposed: peer.profile.recentPosts.length === 0,
      engagementSource: peer.metrics.engagementSource,
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
