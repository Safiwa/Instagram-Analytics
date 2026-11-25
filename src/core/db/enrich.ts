import type { CreatorProfile } from "../data/types";
import { toAudience } from "../instagram/audience";
import { isDatabaseConfigured } from "./client";
import { loadConnectedInsights } from "./connected";
import { loadFollowerSample } from "./followerChecks";
import { loadStoredEngagement } from "./indexStore";
import { loadTrackingHistory } from "./snapshots";

// Adds what this site has stored about a profile: its daily history, insights
// its owner shared by connecting the account, and, when Instagram hides every
// post on this lookup, the last measured engagement.
// Demo fixtures and lookups without a database come back unchanged.
export async function withStoredHistory(profile: CreatorProfile): Promise<CreatorProfile> {
  if (profile.source === "demo" || !isDatabaseConfigured()) {
    return profile;
  }

  const needsEngagement = !profile.isPrivate && profile.recentPosts.length === 0;
  const [tracking, storedEngagement, connected, followerSample] = await Promise.all([
    loadTrackingHistory(profile.username),
    needsEngagement ? loadStoredEngagement(profile.username) : Promise.resolve(null),
    loadConnectedInsights(profile.username),
    loadFollowerSample(profile.username).catch(() => null),
  ]);
  const audience = connected ? toAudience(connected.demographics) : undefined;

  return {
    ...profile,
    ...(tracking ? { tracking } : {}),
    ...(storedEngagement ? { storedEngagement } : {}),
    ...(connected ? { connectedInsights: connected.insights } : {}),
    ...(audience ? { audience } : {}),
    // Followers checked from the owner's uploaded list replace the modeled
    // fake-follower range with a per-follower audit.
    ...(followerSample && !profile.followerSample ? { followerSample } : {}),
  };
}
