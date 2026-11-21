import { analyzeGrowth } from "../analytics/growth";
import { computeMetrics } from "../analytics/metrics";
import { log } from "../logging/logger";
import { fetchLiveProfile, isLiveConfigured } from "./live";
import { REGION_BOARDS, regionForHandle, type Region } from "./regions";
import { readTrackedSnapshot, writeTrackedSnapshot } from "./tracked-store";
import type { CreatorProfile, Post } from "./types";

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
] as const;

export type LeaderboardEntry = {
  username: string;
  displayName: string;
  followers: number;
  engagementRate: number;
  windowRate: number;
  postsInWindow: number;
  avgInteractions: number;
  followerChangePct: number;
  followerChangeEstimated: boolean;
  rankScore: number;
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

// Followers carry the most weight, then engagement rate, average interactions and
// 30-day follower change. Signals are normalised to 0-100 against fixed anchors so
// scores stay stable across refreshes and between the global and region boards.
export const RANK_WEIGHTS = {
  followers: 0.55,
  engagement: 0.2,
  interactions: 0.15,
  followerChange: 0.1,
} as const;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function logScore(value: number, ceiling: number): number {
  if (value <= 0) {
    return 0;
  }
  return clamp((Math.log10(value) / Math.log10(ceiling)) * 100, 0, 100);
}

export function rankScore(entry: {
  followers: number;
  engagementRate: number;
  avgInteractions: number;
  followerChangePct: number;
}): number {
  const followers = logScore(entry.followers, 200_000_000);
  const engagement = clamp((entry.engagementRate / 5) * 100, 0, 100);
  const interactions = logScore(entry.avgInteractions, 2_000_000);
  const followerChange = clamp(((entry.followerChangePct + 5) / 20) * 100, 0, 100);

  return round2(
    followers * RANK_WEIGHTS.followers +
      engagement * RANK_WEIGHTS.engagement +
      interactions * RANK_WEIGHTS.interactions +
      followerChange * RANK_WEIGHTS.followerChange,
  );
}

function byRank(left: LeaderboardEntry, right: LeaderboardEntry): number {
  return right.rankScore - left.rankScore || right.followers - left.followers;
}

const CACHE_TTL_MS = 15 * 60 * 1000;
const WINDOW_MS = TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const FETCH_CHUNK = 10;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

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
  const growth = analyzeGrowth(profile, new Date(now));
  const avgInteractions = round2(
    metrics.avgLikes + metrics.avgComments + (metrics.avgSaves ?? 0),
  );

  return {
    username: profile.username,
    displayName: profile.displayName,
    followers: profile.followers,
    engagementRate: metrics.engagementRate,
    windowRate: window.rate,
    postsInWindow: window.count,
    avgInteractions,
    followerChangePct: growth.monthGrowthPct ?? 0,
    followerChangeEstimated: growth.growthEstimated,
    rankScore: rankScore({
      followers: profile.followers,
      engagementRate: metrics.engagementRate,
      avgInteractions,
      followerChangePct: growth.monthGrowthPct ?? 0,
    }),
    profilePictureUrl: profile.profilePictureUrl,
  };
}

function regionalBoards(entries: LeaderboardEntry[]): Record<Region, LeaderboardEntry[]> {
  const boards = {} as Record<Region, LeaderboardEntry[]>;
  for (const board of REGION_BOARDS) {
    boards[board.id] = entries
      .filter((entry) => regionForHandle(entry.username) === board.id)
      .sort(byRank)
      .slice(0, LEADERBOARD_SIZE);
  }
  return boards;
}

export function rankProfiles(profiles: CreatorProfile[], now = new Date()): Leaderboard {
  const entries = profiles
    .map((profile) => toEntry(profile, now.getTime()))
    .filter((entry): entry is LeaderboardEntry => entry !== null);

  const engaged = [...entries]
    .sort((left, right) =>
      right.engagementRate - left.engagementRate || right.followers - left.followers,
    )
    .slice(0, LEADERBOARD_SIZE);

  // Trending still requires posts in the 15-day window, but the order is now the
  // four-factor rank score rather than the window engagement rate alone.
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

let trackedCache: { expiresAt: number; value: Promise<CreatorProfile[]> } | null = null;

export function getTrackedProfiles(): Promise<CreatorProfile[]> {
  if (trackedCache && trackedCache.expiresAt > Date.now()) {
    return trackedCache.value;
  }

  const value = loadTrackedProfiles();
  trackedCache = { expiresAt: Date.now() + CACHE_TTL_MS, value };
  return value;
}

const TRACKED_SIGNATURE = LEADERBOARD_HANDLES.join(",");

async function loadTrackedProfiles(): Promise<CreatorProfile[]> {
  const snapshot = await readTrackedSnapshot(TRACKED_SIGNATURE);
  if (snapshot) {
    return snapshot;
  }

  const profiles = await fetchTrackedProfiles();
  await writeTrackedSnapshot(profiles, TRACKED_SIGNATURE);
  return profiles;
}

async function fetchTrackedProfiles(): Promise<CreatorProfile[]> {
  if (!isLiveConfigured()) {
    return [];
  }

  const profiles: CreatorProfile[] = [];

  for (let index = 0; index < LEADERBOARD_HANDLES.length; index += FETCH_CHUNK) {
    const chunk = LEADERBOARD_HANDLES.slice(index, index + FETCH_CHUNK);
    const results = await Promise.allSettled(chunk.map((handle) => fetchLiveProfile(handle)));

    for (const result of results) {
      if (result.status === "fulfilled") {
        profiles.push(result.value);
      } else {
        log.warn("tracked profile skipped", {
          message: result.reason instanceof Error ? result.reason.message : "unknown",
        });
      }
    }
  }

  return profiles;
}

async function buildLeaderboard(): Promise<Leaderboard> {
  if (!isLiveConfigured()) {
    log.warn("global leaderboard skipped: live API not configured");
    return emptyLeaderboard();
  }

  try {
    const profiles = await getTrackedProfiles();
    const board = rankProfiles(profiles);
    log.info("global leaderboard refreshed", {
      tracked: board.tracked,
      trending: board.trending.length,
      engaged: board.engaged.length,
    });
    return board;
  } catch (error) {
    log.error("global leaderboard refresh failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return emptyLeaderboard();
  }
}

let cached: { expiresAt: number; value: Promise<Leaderboard> } | null = null;

export function getLeaderboard(): Promise<Leaderboard> {
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const value = buildLeaderboard();
  cached = { expiresAt: Date.now() + CACHE_TTL_MS, value };
  return value;
}
