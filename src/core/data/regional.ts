import { getTrackedProfiles } from "./leaderboard";
import { isInRegionBoard } from "./regions";
import type { CreatorProfile } from "./types";

// The profile-page regional benchmark covers the full Middle East board, which
// includes the dedicated UAE accounts as well as the other tracked countries.
export function isMiddleEastProfile(username: string): boolean {
  return isInRegionBoard(username, "middle-east");
}

export async function getRegionalProfiles(): Promise<CreatorProfile[]> {
  const profiles = await getTrackedProfiles();
  return profiles.filter((profile) => isMiddleEastProfile(profile.username));
}
