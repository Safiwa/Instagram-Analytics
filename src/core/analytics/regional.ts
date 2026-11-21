import { formatCompact, formatPercent } from "../format";
import type { CreatorProfile } from "../data/types";
import { computeMetrics, type ProfileMetrics } from "./metrics";
import { profileTopics } from "./peer";

export type KeyComparison = {
  label: string;
  target: string;
  peer: string;
  insight: string;
};

export type RegionalPeer = {
  profile: CreatorProfile;
  metrics: ProfileMetrics;
  matchScore: number;
  sharedBusiness: string[];
};

export type RegionalComparison = {
  peer: RegionalPeer;
  comparisons: KeyComparison[];
};

export type RegionalRankRow = {
  profile: CreatorProfile;
  engagementRate: number;
  matchScore: number | null;
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

// Relative category fit inside the curated UAE/GCC pool. It is intentionally scaled
// to 80-99: 80 means "in this regional business set", 99 means an almost identical
// audience size, niche and engagement. It is not an absolute claim of identity.
function categoryMatch(
  target: CreatorProfile,
  metrics: ProfileMetrics,
  candidate: CreatorProfile,
  candidateMetrics: ProfileMetrics,
  shared: string[],
): number {
  const magnitudeGap = Math.abs(
    Math.log10(Math.max(target.followers, 1)) - Math.log10(Math.max(candidate.followers, 1)),
  );
  const sizeScore = clamp(100 - magnitudeGap * 25, 0, 100);
  const engagementGap = Math.abs(metrics.engagementRate - candidateMetrics.engagementRate);
  const engagementScore = clamp(100 - engagementGap * 8, 0, 100);
  const topicScore = shared.length > 0 ? clamp(70 + shared.length * 10, 0, 100) : 45;
  const raw = 0.5 * topicScore + 0.3 * sizeScore + 0.2 * engagementScore;
  return 80 + Math.round((19 * raw) / 100);
}

function rankedCandidates(
  target: CreatorProfile,
  metrics: ProfileMetrics,
  pool: CreatorProfile[],
): RegionalPeer[] {
  const candidates = pool.filter(
    (candidate) =>
      candidate.username !== target.username &&
      candidate.followers > 0 &&
      candidate.recentPosts.length > 0,
  );

  return candidates
    .map((candidate) => {
      const candidateMetrics = computeMetrics(candidate);
      const shared = sharedTopics(target, candidate);
      return {
        profile: candidate,
        metrics: candidateMetrics,
        matchScore: categoryMatch(target, metrics, candidate, candidateMetrics, shared),
        sharedBusiness: shared,
      };
    })
    .sort(
      (left, right) =>
        right.sharedBusiness.length - left.sharedBusiness.length ||
        right.matchScore - left.matchScore ||
        right.profile.followers - left.profile.followers,
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

export function buildKeyComparisons(
  target: CreatorProfile,
  metrics: ProfileMetrics,
  peer: RegionalPeer,
): KeyComparison[] {
  const targetAuthenticity = metrics.authenticityPct ?? 0;
  const peerAuthenticity = peer.metrics.authenticityPct ?? 0;
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
      label: "Authenticity (est.)",
      target: `${formatPercent(metrics.authenticityPct)}${metrics.authenticityEstimated ? " est." : ""}`,
      peer: `${formatPercent(peer.metrics.authenticityPct)}${peer.metrics.authenticityEstimated ? " est." : ""}`,
      insight: differenceInsight("authenticity", targetAuthenticity, peerAuthenticity, " pts"),
    },
    {
      label: "Verification",
      target: target.isVerified ? "Verified" : "Not verified",
      peer: peer.profile.isVerified ? "Verified" : "Not verified",
      insight:
        target.isVerified === peer.profile.isVerified
          ? target.isVerified
            ? "Both accounts are verified"
            : "Neither account is verified"
          : target.isVerified
            ? "This profile is verified; its peer is not"
            : "Its peer is verified; this profile is not",
    },
  ];
}

export function buildRegionalRanking(
  target: CreatorProfile,
  metrics: ProfileMetrics,
  pool: CreatorProfile[],
  limit = 10,
): RegionalRanking | null {
  const peers = rankedCandidates(target, metrics, pool).slice(0, limit);
  if (peers.length === 0) {
    return null;
  }

  const rows: RegionalRankRow[] = [
    {
      profile: target,
      engagementRate: metrics.engagementRate,
      matchScore: null,
      isTarget: true,
    },
    ...peers.map((peer) => ({
      profile: peer.profile,
      engagementRate: peer.metrics.engagementRate,
      matchScore: peer.matchScore,
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
