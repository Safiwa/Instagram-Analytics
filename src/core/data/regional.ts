import { getTrackedProfiles, UAE_GCC_HANDLES } from "./leaderboard";
import type { CreatorProfile } from "./types";

const HANDLE_SET = new Set<string>(UAE_GCC_HANDLES);

export async function getRegionalProfiles(): Promise<CreatorProfile[]> {
  const profiles = await getTrackedProfiles();
  return profiles.filter((profile) => HANDLE_SET.has(profile.username.toLowerCase()));
}
