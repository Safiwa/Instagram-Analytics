import { after } from "next/server";
import { EmptyState } from "../../../components/EmptyState";
import { excludedExclusiveHandles } from "../../../core/analytics/exclusive";
import { analyzeGrowth } from "../../../core/analytics/growth";
import { computeMetrics, type ProfileMetrics } from "../../../core/analytics/metrics";
import { buildPeerRanking, findClosestPeer } from "../../../core/analytics/peer";
import {
  buildKeyComparisons,
  buildRegionalRanking,
  findRegionalCategoryPeer,
} from "../../../core/analytics/regional";
import { resolveProfile } from "../../../core/data/adapter";
import { getTrackedProfiles } from "../../../core/data/leaderboard";
import { getRegionalProfiles } from "../../../core/data/regional";
import type { CreatorProfile } from "../../../core/data/types";
import { indexPosition } from "../../../core/analytics/benchmark";
import { withStoredHistory } from "../../../core/db/enrich";
import { getIndexSample } from "../../../core/db/indexStore";
import { recordProfileSnapshot } from "../../../core/db/snapshots";
import { ProfileDashboard } from "../../../features/profile/ProfileDashboard";

export const maxDuration = 60;

type ProfilePageProps = {
  params: Promise<{ username: string }>;
};

type Benchmarks = {
  peer: ReturnType<typeof findClosestPeer>;
  ranking: ReturnType<typeof buildPeerRanking>;
  regionalPeer: ReturnType<typeof findRegionalCategoryPeer>;
  regionalRanking: ReturnType<typeof buildRegionalRanking>;
};

function buildBenchmarks(
  profile: CreatorProfile,
  metrics: ProfileMetrics,
  tracked: CreatorProfile[],
  regionalPool: CreatorProfile[],
): Benchmarks {
  return {
    peer: findClosestPeer(profile, metrics, tracked),
    ranking: buildPeerRanking(profile, metrics, tracked),
    regionalPeer: findRegionalCategoryPeer(profile, metrics, regionalPool),
    regionalRanking: buildRegionalRanking(profile, metrics, regionalPool),
  };
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { username } = await params;
  const resolution = await resolveProfile(username);

  if (resolution.status !== "found") {
    return (
      <EmptyState
        title={resolution.status === "not_found" ? "Profile not found" : "Profile unavailable"}
        description={resolution.message}
        action={{ href: "/", label: "Back to directory" }}
      />
    );
  }

  const resolved = resolution.profile;
  // Today's snapshot is written after the response is sent, so storing history
  // never slows the page down. Demo fixtures are never stored.
  after(() => recordProfileSnapshot(resolved, { lookup: true }));

  const [profile, tracked, sample] = await Promise.all([
    withStoredHistory(resolved),
    getTrackedProfiles(),
    resolved.source === "demo" ? Promise.resolve([]) : getIndexSample(),
  ]);
  const regionalPool = await getRegionalProfiles();
  const metrics = computeMetrics(profile);
  const position =
    metrics.engagementSource === "unavailable"
      ? null
      : indexPosition(profile.username, profile.followers, metrics.engagementRate, sample);
  const growth = analyzeGrowth(profile);
  const initial = buildBenchmarks(profile, metrics, tracked, regionalPool);
  const excluded = excludedExclusiveHandles(initial);
  // Remove duplicate peers from the pools before ranking, so a five-profile
  // panel keeps all five rows instead of losing the duplicate's row afterwards.
  const { peer, ranking, regionalPeer, regionalRanking } =
    excluded.size === 0
      ? initial
      : buildBenchmarks(
          profile,
          metrics,
          tracked.filter((candidate) => !excluded.has(candidate.username.toLowerCase())),
          regionalPool.filter((candidate) => !excluded.has(candidate.username.toLowerCase())),
        );
  const regionalComparison = regionalPeer
    ? buildKeyComparisons(profile, metrics, regionalPeer)
    : [];

  return (
    <ProfileDashboard
      profile={profile}
      metrics={metrics}
      growth={growth}
      peer={peer}
      ranking={ranking}
      regionalPeer={regionalPeer}
      regionalComparison={regionalComparison}
      regionalRanking={regionalRanking}
      indexPosition={position}
    />
  );
}
