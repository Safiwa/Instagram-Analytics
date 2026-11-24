import type { CreatorProfile } from "../data/types";
import { isDatabaseConfigured } from "./client";
import { loadStoredEngagement } from "./indexStore";
import { loadTrackingHistory } from "./snapshots";

// Adds what this site has stored about a profile: its daily history and, when
// Instagram hides every post on this lookup, the last measured engagement.
// Demo fixtures and lookups without a database come back unchanged.
export async function withStoredHistory(profile: CreatorProfile): Promise<CreatorProfile> {
  if (profile.source === "demo" || !isDatabaseConfigured()) {
    return profile;
  }

  const needsEngagement = !profile.isPrivate && profile.recentPosts.length === 0;
  const [tracking, storedEngagement] = await Promise.all([
    loadTrackingHistory(profile.username),
    needsEngagement ? loadStoredEngagement(profile.username) : Promise.resolve(null),
  ]);

  return {
    ...profile,
    ...(tracking ? { tracking } : {}),
    ...(storedEngagement ? { storedEngagement } : {}),
  };
}
