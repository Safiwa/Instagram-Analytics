import { EmptyState } from "../../../components/EmptyState";
import { dedupeProfileBenchmarks } from "../../../core/analytics/exclusive";
import { analyzeGrowth } from "../../../core/analytics/growth";
import { computeMetrics } from "../../../core/analytics/metrics";
import { buildPeerRanking, findClosestPeer } from "../../../core/analytics/peer";
import {
  buildKeyComparisons,
  buildRegionalRanking,
  findRegionalCategoryPeer,
} from "../../../core/analytics/regional";
import { resolveProfile } from "../../../core/data/adapter";
import { getTrackedProfiles } from "../../../core/data/leaderboard";
import { getRegionalProfiles } from "../../../core/data/regional";
import { ProfileDashboard } from "../../../features/profile/ProfileDashboard";

export const maxDuration = 60;

type ProfilePageProps = {
  params: Promise<{ username: string }>;
};

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

  const metrics = computeMetrics(resolution.profile);
  const growth = analyzeGrowth(resolution.profile);
  const tracked = await getTrackedProfiles();
  const regionalPool = await getRegionalProfiles();
  const { peer, ranking, regionalPeer, regionalRanking } = dedupeProfileBenchmarks({
    peer: findClosestPeer(resolution.profile, metrics, tracked),
    ranking: buildPeerRanking(resolution.profile, metrics, tracked),
    regionalPeer: findRegionalCategoryPeer(resolution.profile, metrics, regionalPool),
    regionalRanking: buildRegionalRanking(resolution.profile, metrics, regionalPool),
  });
  const regionalComparison = regionalPeer
    ? buildKeyComparisons(resolution.profile, metrics, regionalPeer)
    : [];

  return (
    <ProfileDashboard
      profile={resolution.profile}
      metrics={metrics}
      growth={growth}
      peer={peer}
      ranking={ranking}
      regionalPeer={regionalPeer}
      regionalComparison={regionalComparison}
      regionalRanking={regionalRanking}
    />
  );
}
