import type { CreatorProfile } from "../data/types";
import { computeMetrics, type ProfileMetrics } from "./metrics";

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

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function profileTopics(profile: CreatorProfile): Set<string> {
  const text = `${profile.displayName} ${profile.category} ${profile.bio}`.toLowerCase();
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
  score: number;
  reasons: string[];
};

function scorePeers(
  target: CreatorProfile,
  metrics: ProfileMetrics,
  pool: CreatorProfile[],
): PeerMatch[] {
  const candidates = pool.filter(
    (candidate) =>
      candidate.username !== target.username &&
      candidate.followers > 0 &&
      candidate.recentPosts.length > 0,
  );

  if (candidates.length === 0) {
    return [];
  }

  const targetTopics = profileTopics(target);
  const targetMagnitude = Math.log10(Math.max(target.followers, 1));

  const scored = candidates.map((candidate) => {
    const candidateMetrics = computeMetrics(candidate);
    const magnitudeGap = Math.abs(targetMagnitude - Math.log10(Math.max(candidate.followers, 1)));
    const sizeScore = clamp(100 - magnitudeGap * 55, 0, 100);
    const sharedTopics = overlap(targetTopics, profileTopics(candidate));
    const topicScore = sharedTopics.length > 0 ? clamp(60 + sharedTopics.length * 20, 0, 100) : 0;
    const engagementGap = Math.abs(metrics.engagementRate - candidateMetrics.engagementRate);
    const engagementScore = clamp(100 - engagementGap * 25, 0, 100);

    const score = round2(sizeScore * 0.55 + topicScore * 0.25 + engagementScore * 0.2);
    const reasons: string[] = [];

    if (sizeScore >= 70) {
      reasons.push("similar audience size");
    }
    if (sharedTopics.length > 0) {
      reasons.push(`shares ${sharedTopics.slice(0, 2).join(" and ")} themes`);
    }
    if (engagementScore >= 70) {
      reasons.push("comparable engagement rate");
    }
    if (reasons.length === 0) {
      reasons.push("closest available public profile by audience size and engagement");
    }

    return { profile: candidate, metrics: candidateMetrics, score, reasons };
  });

  scored.sort(
    (left, right) =>
      right.score - left.score || left.profile.username.localeCompare(right.profile.username),
  );

  return scored;
}

export function findClosestPeer(
  target: CreatorProfile,
  metrics: ProfileMetrics,
  pool: CreatorProfile[],
): PeerMatch | null {
  return scorePeers(target, metrics, pool)[0] ?? null;
}

export type PeerRankingRow = {
  profile: CreatorProfile;
  engagementRate: number;
  matchScore: number | null;
  isTarget: boolean;
};

export type PeerRanking = {
  rows: PeerRankingRow[];
  targetRank: number;
  total: number;
  outperformedPercent: number | null;
};

// Builds a small leaderboard from the searched profile plus its closest comparable
// peers, so the searched profile can see its rank rather than a single reference point.
export function buildPeerRanking(
  target: CreatorProfile,
  metrics: ProfileMetrics,
  pool: CreatorProfile[],
  limit = 5,
): PeerRanking | null {
  const peers = scorePeers(target, metrics, pool).slice(0, limit);
  if (peers.length === 0) {
    return null;
  }

  const rows: PeerRankingRow[] = [
    {
      profile: target,
      engagementRate: metrics.engagementRate,
      matchScore: null,
      isTarget: true,
    },
    ...peers.map((peer) => ({
      profile: peer.profile,
      engagementRate: peer.metrics.engagementRate,
      matchScore: peer.score,
      isTarget: false,
    })),
  ];

  rows.sort(
    (left, right) =>
      right.engagementRate - left.engagementRate ||
      right.profile.followers - left.profile.followers,
  );

  const beaten = peers.filter(
    (peer) => peer.metrics.engagementRate < metrics.engagementRate,
  ).length;

  return {
    rows,
    targetRank: rows.findIndex((row) => row.isTarget) + 1,
    total: rows.length,
    outperformedPercent: Math.round((beaten / peers.length) * 100),
  };
}
