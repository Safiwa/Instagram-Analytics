import { isMiddleEastAccount } from "../analytics/country";
import { loadIndexedProfiles } from "../db/indexStore";
import { AGENCY_HANDLES } from "./agencies";
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
  const curated = [...byUsername.values()].filter((profile) => isMiddleEastProfile(profile.username));

  // Beyond the curated board, every Middle East account this site has indexed
  // (from lookups and the daily collector) can be a peer, so smaller accounts
  // and non-creator categories such as marketing agencies find real matches.
  // Peers still need published country evidence in the ranking itself.
  const seen = new Set(curated.map((profile) => profile.username.toLowerCase()));
  const indexed = (await loadIndexedMiddleEast()).filter(
    (profile) => !seen.has(profile.username.toLowerCase()),
  );
  return mergePools([...curated, ...indexed], await getAgencyProfiles());
}

// Accounts never used as peers: handles that look like official tourism boards
// but are small unrelated accounts. They stay viewable on their own page.
const EXCLUDED_PEER_HANDLES = new Set([
  "visitegypt",
  "visitlebanon",
  "visitbahrain",
  "visitsyria",
  "visitiraq",
  "visittunisia",
  "visitmorocco",
]);

export function isExcludedPeer(username: string): boolean {
  return EXCLUDED_PEER_HANDLES.has(username.toLowerCase());
}

const INDEXED_POOL_LIMIT = 400;
const INDEXED_POOL_TTL_MS = 10 * 60 * 1000;
let indexedPool: { expiresAt: number; profiles: CreatorProfile[] } | null = null;

// Every public profile this site has indexed recently (lookups and the daily
// collector), cached for ten minutes. Peer rankings draw on it so same-country
// and same-category peers exist beyond the curated tracked list.
export async function getIndexedPool(): Promise<CreatorProfile[]> {
  if (indexedPool && indexedPool.expiresAt > Date.now()) {
    return indexedPool.profiles;
  }
  const profiles = (await loadIndexedProfiles({ limit: INDEXED_POOL_LIMIT })).filter(
    (profile) => !profile.isPrivate && !isExcludedPeer(profile.username),
  );
  indexedPool = { expiresAt: Date.now() + INDEXED_POOL_TTL_MS, profiles };
  return profiles;
}

async function loadIndexedMiddleEast(): Promise<CreatorProfile[]> {
  return (await getIndexedPool()).filter((profile) => isMiddleEastAccount(profile));
}

// Marketing agencies are a thin category in the general top-400 index, so they
// are loaded by handle from this site's own stored snapshots instead of being
// dropped by the follower-count limit. Every value still comes from a real
// snapshot; the constant only names accounts to look up.
export async function getAgencyProfiles(): Promise<CreatorProfile[]> {
  return (await loadIndexedProfiles({ usernames: AGENCY_HANDLES })).filter(
    (profile) => !profile.isPrivate && profile.followers > 0 && profile.recentPosts.length > 0,
  );
}

// Tracked profiles first (fresher data), then indexed profiles not already in.
export function mergePools(primary: CreatorProfile[], extra: CreatorProfile[]): CreatorProfile[] {
  const seen = new Set(primary.map((profile) => profile.username.toLowerCase()));
  return [...primary, ...extra.filter((profile) => !seen.has(profile.username.toLowerCase()))];
}

export function resetRegionalPoolCacheForTests(): void {
  indexedPool = null;
}
