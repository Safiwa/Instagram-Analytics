import { getTrackedProfiles } from "./leaderboard";
import { isInRegionBoard } from "./regions";
import { REGIONAL_PEER_SNAPSHOTS } from "./regional-peer-snapshots";
import type { CreatorProfile } from "./types";

// The profile-page regional benchmark covers the full Middle East board, which
// includes the dedicated UAE accounts as well as the other tracked countries.
export function isMiddleEastProfile(username: string): boolean {
  return isInRegionBoard(username, "middle-east");
}

export async function getRegionalProfiles(): Promise<CreatorProfile[]> {
  const profiles = await getTrackedProfiles();
  const byUsername = new Map(
    profiles.map((profile) => [profile.username.toLowerCase(), profile]),
  );
  // A newly curated peer can be missing while the shared snapshot waits for its
  // next paced Meta refresh. Fall back to the real captured public snapshot so
  // the five-row panel does not silently shrink, without overriding fresh data.
  for (const snapshot of REGIONAL_PEER_SNAPSHOTS) {
    const key = snapshot.username.toLowerCase();
    if (!byUsername.has(key)) {
      byUsername.set(key, snapshot);
    }
  }
  return [...byUsername.values()].filter((profile) => isMiddleEastProfile(profile.username));
}
