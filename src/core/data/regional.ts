import { loadIndexedProfiles } from "../db/indexStore";
import { getTrackedProfiles } from "./leaderboard";
import { isInRegionBoard, regionBoardHandles } from "./regions";
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
  // A curated peer can be missing while the shared tracked snapshot waits for
  // its next paced Meta refresh. Fill the gap from this site's own stored daily
  // snapshots (in-house index) so the five-row panel does not silently shrink,
  // without overriding fresher tracked data.
  const missing = regionBoardHandles("middle-east").filter((handle) => !byUsername.has(handle));
  if (missing.length > 0) {
    for (const stored of await loadIndexedProfiles({ usernames: missing })) {
      const key = stored.username.toLowerCase();
      if (!byUsername.has(key)) {
        byUsername.set(key, stored);
      }
    }
  }
  return [...byUsername.values()].filter((profile) => isMiddleEastProfile(profile.username));
}
