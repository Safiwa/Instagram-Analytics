import { EmptyState } from "../../../components/EmptyState";
import { analyzeGrowth } from "../../../core/analytics/growth";
import { computeMetrics } from "../../../core/analytics/metrics";
import { findClosestPeer } from "../../../core/analytics/peer";
import { resolveProfile } from "../../../core/data/adapter";
import { getTrackedProfiles } from "../../../core/data/leaderboard";
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
  const peer = findClosestPeer(resolution.profile, metrics, await getTrackedProfiles());

  return (
    <ProfileDashboard
      profile={resolution.profile}
      metrics={metrics}
      growth={growth}
      peer={peer}
    />
  );
}
