import { inferCountrySignal } from "../analytics/country";
import { computeMetrics } from "../analytics/metrics";
import { rankFactors, rankScore, round2 } from "../analytics/rank";
import { log } from "../logging/logger";
import { fetchLiveProfile, isLiveConfigured } from "./live";
import { isInRegionBoard, REGION_BOARDS, type Region } from "./regions";
import {
  readTrackedSnapshotAny,
  TRACKED_SNAPSHOT_TTL_SECONDS,
  writeTrackedSnapshot,
} from "./tracked-store";
import type { CreatorProfile, Post } from "./types";

export { RANK_WEIGHTS, rankScore } from "../analytics/rank";

export const TRENDING_WINDOW_DAYS = 15;
export const LEADERBOARD_SIZE = 10;

// Real, public Instagram Business/Creator accounts with worldwide reach. This is a
// curated tracked pool, not an exhaustive index of every account on Instagram.
export const LEADERBOARD_HANDLES = [
  "cristiano",
  "leomessi",
  "selenagomez",
  "kyliejenner",
  "therock",
  "arianagrande",
  "kimkardashian",
  "beyonce",
  "lilbieber",
  "kendalljenner",
  "taylorswift",
  "virat.kohli",
  "neymarjr",
  "zendaya",
  "badgalriri",
  "billieeilish",
  "mrbeast",
  "charlidamelio",
  "jlo",
  "leonardodicaprio",
  "natgeo",
  // Curated real UAE/GCC Creator and Business accounts (see UAE_GCC_HANDLES).
  "hudabeauty",
  "the.matis",
  "trending.vibz.uae",
  "ola.alqodmani",
  "emirates",
  "flydubai",
  "timeoutdubai",
  "gulfnews",
  "khaleejtimes",
  "arabianbusiness",
  "jumeirah",
  "burjkhalifa",
  "qatarairways",
  "visitqatar",
  "dubaimall",
  "rafflesdubai",
  // Curated real accounts for the four homepage region boards (see regions.ts).
  "chiaraferragni",
  "davidguetta",
  "sofiamcoelho",
  "zoella",
  "fcbarcelona",
  "realmadrid",
  "psg",
  "premierleague",
  "adidas",
  "gucci",
  "aljazeera",
  "alarabiya",
  "asharqnews",
  "arabnews",
  "visitsaudi",
  "flynas",
  "qatar",
  "visitjordan",
  // Curated real public accounts covering the wider Middle East board.
  "visitsyria",
  "visitiraq",
  "explorepalestine",
  "visitkuwait",
  "visitegypt",
  "visitlebanon",
  "visitbahrain",
  "visitoman",
  "visittunisia",
  "visitmorocco",
  // Real, publicly discoverable Middle East creator accounts in the same
  // follower range as @rim.official__, with explicit public category labels.
  "alisha_sajjal",
  "alitofique",
  "hinaashh",
  "jexmi",
  "najet.dh",
  "elsakahwaji",
  // Real, explicitly labeled UAE creators in the 46–72K Middle East band. They
  // fill the five-profile regional rank for the smaller UAE creator accounts
  // without widening the ±30% gate or accepting fallback category labels.
  "donya_esmailiii",
  "aiamwa",
  "dina_h_ussien",
  "poojaabis",
  "taranum_sshahin",
  "dina.ak",
  "anshi_pandyala_official",
  "zeniamk",
  // Real, explicitly labeled UAE creators in @amrmaskoun's ±30% follower band.
  // They make the Middle East rank panel honest without relaxing the hard gate.
  "amrmaskoun",
  "wessamq",
  "taimalfalasi",
  "baneenstars",
  "technicalguruji",
  // Real, explicitly labeled UAE creators in @alaaabuharb's 1.7–3.1M band.
  // They fill the Middle East rank panel honestly without widening the ±30% gate.
  "sarahmalas",
  "randdalati",
  "rima_alosta",
  "lookatsascha",
  // Real, explicitly labeled creators in @zuhaboutique2024's 30.8–57.1K band.
  // They bracket the disclosed Modash-backed rank without widening the gate.
  "khalus_recipes",
  "ladyandhersweetescapes",
  "airagymn",
  "warrior_arezou",
] as const;

// Real, public UAE/GCC accounts verified through the live Instagram Business Discovery
// path. Curated reference set, not a complete directory of every regional account.
export const UAE_GCC_HANDLES = [
  "hudabeauty",
  "trending.vibz.uae",
  "ola.alqodmani",
  "the.matis",
  "emirates",
  "flydubai",
  "timeoutdubai",
  "gulfnews",
  "khaleejtimes",
  "arabianbusiness",
  "jumeirah",
  "burjkhalifa",
  "qatarairways",
  "visitqatar",
  "dubaimall",
  "rafflesdubai",
  "alisha_sajjal",
  "alitofique",
  "hinaashh",
  "jexmi",
  "donya_esmailiii",
  "aiamwa",
  "dina_h_ussien",
  "poojaabis",
  "taranum_sshahin",
  "dina.ak",
  "anshi_pandyala_official",
  "zeniamk",
  "amrmaskoun",
  "wessamq",
  "taimalfalasi",
  "baneenstars",
  "technicalguruji",
  "sarahmalas",
  "randdalati",
  "rima_alosta",
  "lookatsascha",
  "khalus_recipes",
  "ladyandhersweetescapes",
  "airagymn",
] as const;

export type LeaderboardEntry = {
  username: string;
  displayName: string;
  followers: number;
  engagementRate: number;
  windowRate: number;
  postsInWindow: number;
  avgLikes: number;
  avgComments: number;
  followerChangePct: number;
  followerChangeEstimated: boolean;
  rankScore: number;
  // Editorial country signal from public handle/profile text. Instagram does
  // not publish an account country field, so unavailable values stay explicit.
  countryLabel: string;
  profilePictureUrl?: string;
};

export type Leaderboard = {
  trending: LeaderboardEntry[];
  engaged: LeaderboardEntry[];
  regional: Record<Region, LeaderboardEntry[]>;
  tracked: number;
  generatedAt: string;
  windowDays: number;
};

// Ranking math lives in analytics/rank so homepage boards, profile benchmarks
// and compare suggestions all use exactly the same five-signal score.
function byRank(left: LeaderboardEntry, right: LeaderboardEntry): number {
  return right.rankScore - left.rankScore || right.followers - left.followers;
}

// Country boards are "top ten" lists, so follower count is the primary key. The
// weighted score only breaks ties; a small account with a viral post cannot
// take a top-ten slot from a materially larger account in the same region.
function byFollowersFirst(left: LeaderboardEntry, right: LeaderboardEntry): number {
  return (
    right.followers - left.followers ||
    right.rankScore - left.rankScore ||
    left.username.localeCompare(right.username)
  );
}

const CACHE_TTL_MS = 15 * 60 * 1000;
const WINDOW_MS = TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const FETCH_CHUNK = 10;

function windowRate(posts: Post[], followers: number, cutoff: number) {
  const recent = posts.filter((post) => {
    const posted = Date.parse(post.postedAt);
    return Number.isFinite(posted) && posted >= cutoff;
  });

  if (recent.length === 0 || followers <= 0) {
    return { rate: 0, count: 0 };
  }

  const savesComplete = recent.every((post) => typeof post.saves === "number");
  const total = recent.reduce(
    (sum, post) => sum + post.likes + post.comments + (savesComplete ? (post.saves ?? 0) : 0),
    0,
  );

  return {
    rate: round2((total / recent.length / followers) * 100),
    count: recent.length,
  };
}

function toEntry(profile: CreatorProfile, now: number): LeaderboardEntry | null {
  if (profile.followers <= 0 || profile.recentPosts.length === 0) {
    return null;
  }

  const window = windowRate(profile.recentPosts, profile.followers, now - WINDOW_MS);
  const metrics = computeMetrics(profile);
  const factors = rankFactors(profile, metrics, new Date(now));

  return {
    username: profile.username,
    displayName: profile.displayName,
    followers: profile.followers,
    engagementRate: factors.engagementRate,
    windowRate: window.rate,
    postsInWindow: window.count,
    avgLikes: factors.avgLikes,
    avgComments: factors.avgComments,
    followerChangePct: factors.followerChangePct,
    followerChangeEstimated: factors.followerChangeEstimated,
    rankScore: rankScore(factors),
    countryLabel: inferCountrySignal(profile).country ?? "Country not published",
    profilePictureUrl: profile.profilePictureUrl,
  };
}

function regionalBoards(entries: LeaderboardEntry[]): Record<Region, LeaderboardEntry[]> {
  const boards = {} as Record<Region, LeaderboardEntry[]>;
  for (const board of REGION_BOARDS) {
    boards[board.id] = entries
      .filter((entry) => isInRegionBoard(entry.username, board.id))
      .sort(byFollowersFirst)
      .slice(0, LEADERBOARD_SIZE);
  }
  return boards;
}

export function rankProfiles(profiles: CreatorProfile[], now = new Date()): Leaderboard {
  const entries = profiles
    .map((profile) => toEntry(profile, now.getTime()))
    .filter((entry): entry is LeaderboardEntry => entry !== null);

  // High engagement still measures engagement across up to 12 recent public
  // posts, but followers are considered first (55%), then engagement rate (20%),
  // average likes (10%), average comments (5%) and 30-day follower change (10%).
  // It therefore uses the same rank order as the trending and country boards.
  const engaged = [...entries].sort(byRank).slice(0, LEADERBOARD_SIZE);

  // Trending still requires posts in the 15-day window, but the order is now the
  // weighted rank score rather than the window engagement rate alone.
  const trending = entries
    .filter((entry) => entry.postsInWindow > 0)
    .sort(byRank)
    .slice(0, LEADERBOARD_SIZE);

  return {
    trending,
    engaged,
    regional: regionalBoards(entries),
    tracked: entries.length,
    generatedAt: now.toISOString(),
    windowDays: TRENDING_WINDOW_DAYS,
  };
}

function emptyLeaderboard(): Leaderboard {
  return rankProfiles([], new Date());
}

// Bump the prefix whenever the tracked-pool rebuild logic changes so a snapshot
// written by the previous version is not reused with the new expectations.
const TRACKED_SIGNATURE = `v8:${LEADERBOARD_HANDLES.join(",")}`;

// Meta rate-limits large bursts of Business Discovery calls. Instead of
// rebuilding all 55 profiles at once, each refresh updates a small rotating
// batch and merges it into the persisted snapshot. Missing handles are filled
// first, so a partial pool self-heals over a few refresh cycles.
export const REFRESH_BATCH = 10;

// If this many of the attempted handles fail (typically a Meta code 4 rate
// limit), back off for longer before retrying so we do not keep hammering the
// API while it is throttling us.
export const INCOMPLETE_SKIP_RATE = 0.2;
export const INCOMPLETE_TTL_SECONDS = 10 * 60;
const INCOMPLETE_TTL_MS = INCOMPLETE_TTL_SECONDS * 1000;

export function isIncompletePool(attempted: number, skipped: number): boolean {
  return attempted > 0 && skipped / attempted >= INCOMPLETE_SKIP_RATE;
}

type TrackedResult = { profiles: CreatorProfile[]; incomplete: boolean };

let trackedCache: { expiresAt: number; value: Promise<TrackedResult> } | null = null;

function getTrackedResult(): Promise<TrackedResult> {
  if (trackedCache && trackedCache.expiresAt > Date.now()) {
    return trackedCache.value;
  }

  const entry: { expiresAt: number; value: Promise<TrackedResult> } = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value: Promise.resolve({ profiles: [], incomplete: false }),
  };
  entry.value = loadTrackedProfiles().then((result) => {
    if (result.incomplete) {
      entry.expiresAt = Date.now() + INCOMPLETE_TTL_MS;
    }
    return result;
  });
  trackedCache = entry;
  return entry.value;
}

export async function getTrackedProfiles(): Promise<CreatorProfile[]> {
  return (await getTrackedResult()).profiles;
}

export function refreshBatch(handles: readonly string[], now: number): string[] {
  const batchCount = Math.max(1, Math.ceil(handles.length / REFRESH_BATCH));
  const bucket = Math.floor(now / CACHE_TTL_MS) % batchCount;
  return [...handles].slice(bucket * REFRESH_BATCH, (bucket + 1) * REFRESH_BATCH);
}

async function loadTrackedProfiles(): Promise<TrackedResult> {
  // Read any prior snapshot (even one written for an older handle list) so we
  // keep the profiles we already have and only spend Meta calls on the rest.
  const allowed = new Set(LEADERBOARD_HANDLES.map((handle) => handle.toLowerCase()));
  const previous = ((await readTrackedSnapshotAny()) ?? []).filter((profile) =>
    allowed.has(profile.username.toLowerCase()),
  );
  const known = new Set(previous.map((profile) => profile.username.toLowerCase()));
  const missing = LEADERBOARD_HANDLES.filter((handle) => !known.has(handle.toLowerCase()));

  const targets =
    missing.length > 0
      ? missing.slice(0, REFRESH_BATCH)
      : refreshBatch(LEADERBOARD_HANDLES, Date.now());
  const { profiles: fresh, attempted, skipped } = await fetchTrackedProfiles(targets);
  const incomplete = isIncompletePool(attempted, skipped);

  // Failed targets keep their previous copy; successful ones replace it.
  const byUsername = new Map(previous.map((profile) => [profile.username.toLowerCase(), profile]));
  for (const profile of fresh) {
    byUsername.set(profile.username.toLowerCase(), profile);
  }
  const profiles = [...byUsername.values()];
  if (profiles.length === 0) {
    return { profiles, incomplete: true };
  }

  // Always keep accumulated profiles for the full snapshot TTL; only the
  // in-memory retry is backed off, so a longer API outage cannot erase the pool.
  await writeTrackedSnapshot(profiles, TRACKED_SIGNATURE, TRACKED_SNAPSHOT_TTL_SECONDS);
  if (incomplete) {
    log.warn("tracked pool refresh had skips; backing off", {
      attempted,
      skipped,
      profiles: profiles.length,
      ttlSeconds: INCOMPLETE_TTL_SECONDS,
    });
  }
  return { profiles, incomplete };
}

async function fetchTrackedProfiles(
  handles: readonly string[],
): Promise<{ profiles: CreatorProfile[]; attempted: number; skipped: number }> {
  if (!isLiveConfigured() || handles.length === 0) {
    return { profiles: [], attempted: 0, skipped: 0 };
  }

  const profiles: CreatorProfile[] = [];
  let skipped = 0;

  for (let index = 0; index < handles.length; index += FETCH_CHUNK) {
    const chunk = handles.slice(index, index + FETCH_CHUNK);
    const results = await Promise.allSettled(chunk.map((handle) => fetchLiveProfile(handle)));

    for (const result of results) {
      if (result.status === "fulfilled") {
        profiles.push(result.value);
      } else {
        skipped += 1;
        log.warn("tracked profile skipped", {
          message: result.reason instanceof Error ? result.reason.message : "unknown",
        });
      }
    }
  }

  return { profiles, attempted: handles.length, skipped };
}

async function buildLeaderboard(): Promise<{ board: Leaderboard; incomplete: boolean }> {
  if (!isLiveConfigured()) {
    log.warn("global leaderboard skipped: live API not configured");
    return { board: emptyLeaderboard(), incomplete: false };
  }

  try {
    const { profiles, incomplete } = await getTrackedResult();
    const board = rankProfiles(profiles);
    log.info("global leaderboard refreshed", {
      tracked: board.tracked,
      trending: board.trending.length,
      engaged: board.engaged.length,
      incomplete: incomplete ? "true" : "false",
    });
    return { board, incomplete };
  } catch (error) {
    log.error("global leaderboard refresh failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return { board: emptyLeaderboard(), incomplete: true };
  }
}

let cached: { expiresAt: number; value: Promise<Leaderboard> } | null = null;

export function getLeaderboard(): Promise<Leaderboard> {
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const entry: { expiresAt: number; value: Promise<Leaderboard> } = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value: Promise.resolve(emptyLeaderboard()),
  };
  entry.value = buildLeaderboard().then(({ board, incomplete }) => {
    if (incomplete) {
      entry.expiresAt = Date.now() + INCOMPLETE_TTL_MS;
    }
    return board;
  });
  cached = entry;
  return entry.value;
}
