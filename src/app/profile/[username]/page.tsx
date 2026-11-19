import { EmptyState } from "../../../components/EmptyState";
import { computeMetrics } from "../../../core/analytics/metrics";
import { resolveProfile } from "../../../core/data/adapter";
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

  return (
    <ProfileDashboard profile={resolution.profile} metrics={computeMetrics(resolution.profile)} />
  );
}
