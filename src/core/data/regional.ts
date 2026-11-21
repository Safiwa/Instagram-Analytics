import { log } from "../logging/logger";
import { UAE_GCC_HANDLES } from "./leaderboard";
import { fetchLiveProfile, isLiveConfigured } from "./live";
import { readSnapshot, writeSnapshot } from "./tracked-store";
import type { CreatorProfile } from "./types";

// The regional peer ranking needs a dependable UAE/GCC pool. It is kept in its own
// short-lived snapshot so it does not depend on the global leaderboard cache and
// does not fire live lookups on every profile page load. Handles are fetched in
// small chunks because Meta rate-limits large bursts (code 4).
const REGIONAL_SNAPSHOT_KEY = "analytics:regional-pool";
const REGIONAL_TTL_SECONDS = 30 * 60;
const REGIONAL_CACHE_MS = 5 * 60 * 1000;
const FETCH_CHUNK = 4;
const MIN_POOL = 4;

let regionalCache: { expiresAt: number; value: Promise<CreatorProfile[]> } | null = null;

export function getRegionalProfiles(): Promise<CreatorProfile[]> {
  if (regionalCache && regionalCache.expiresAt > Date.now()) {
    return regionalCache.value;
  }
  const value = loadRegionalProfiles();
  regionalCache = { expiresAt: Date.now() + REGIONAL_CACHE_MS, value };
  return value;
}

async function loadRegionalProfiles(): Promise<CreatorProfile[]> {
  const snapshot = await readSnapshot(REGIONAL_SNAPSHOT_KEY);
  if (snapshot && snapshot.length >= MIN_POOL) {
    return snapshot;
  }

  if (!isLiveConfigured()) {
    return snapshot ?? [];
  }

  const profiles: CreatorProfile[] = [];
  for (let index = 0; index < UAE_GCC_HANDLES.length; index += FETCH_CHUNK) {
    const chunk = UAE_GCC_HANDLES.slice(index, index + FETCH_CHUNK);
    const results = await Promise.allSettled(chunk.map((handle) => fetchLiveProfile(handle)));
    for (const result of results) {
      if (
        result.status === "fulfilled" &&
        result.value.followers > 0 &&
        result.value.recentPosts.length > 0
      ) {
        profiles.push(result.value);
      }
    }
  }

  if (profiles.length === 0) {
    log.warn("regional pool refresh returned no profiles");
    return snapshot ?? [];
  }

  await writeSnapshot(REGIONAL_SNAPSHOT_KEY, profiles, REGIONAL_TTL_SECONDS);
  return profiles;
}
