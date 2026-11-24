import type { CreatorProfile } from "../data/types";
import { toAudience } from "../instagram/audience";
import { isDatabaseConfigured } from "./client";
import { loadConnectedInsights } from "./connected";
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
  const [tracking, storedEngagement, connected] = await Promise.all([
    loadTrackingHistory(profile.username),
    needsEngagement ? loadStoredEngagement(profile.username) : Promise.resolve(null),
    loadConnectedInsights(profile.username),
  ]);
  const audience = connected ? toAudience(connected.demographics) : undefined;

  return {
    ...profile,
    ...(tracking ? { tracking } : {}),
    ...(storedEngagement ? { storedEngagement } : {}),
    ...(connected ? { connectedInsights: connected.insights } : {}),
    ...(audience ? { audience } : {}),
  };
}
