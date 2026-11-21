import { computeMetrics } from "../analytics/metrics";
import { log } from "../logging/logger";
import { fetchLiveProfile, isLiveConfigured } from "./live";
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
] as const;

export type LeaderboardEntry = {
  username: string;
  displayName: string;
  followers: number;
  engagementRate: number;
  windowRate: number;
  postsInWindow: number;
  profilePictureUrl?: string;
};

export type Leaderboard = {
  trending: LeaderboardEntry[];
  engaged: LeaderboardEntry[];
  tracked: number;
  generatedAt: string;
  windowDays: number;
};

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

  return {
    username: profile.username,
    displayName: profile.displayName,
    followers: profile.followers,
    engagementRate: computeMetrics(profile).engagementRate,
    windowRate: window.rate,
    postsInWindow: window.count,
    profilePictureUrl: profile.profilePictureUrl,
  };
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

  const trending = entries
    .filter((entry) => entry.postsInWindow > 0)
    .sort((left, right) =>
      right.windowRate - left.windowRate ||
      right.postsInWindow - left.postsInWindow ||
      right.followers - left.followers,
    )
    .slice(0, LEADERBOARD_SIZE);

  return {
    trending,
    engaged,
    tracked: entries.length,
    generatedAt: now.toISOString(),
    windowDays: TRENDING_WINDOW_DAYS,
  };
}

function emptyLeaderboard(): Leaderboard {
  return rankProfiles([], new Date());
}

async function buildLeaderboard(): Promise<Leaderboard> {
  if (!isLiveConfigured()) {
    log.warn("global leaderboard skipped: live API not configured");
    return emptyLeaderboard();
  }

  try {
    const profiles: CreatorProfile[] = [];

    for (let index = 0; index < LEADERBOARD_HANDLES.length; index += FETCH_CHUNK) {
      const chunk = LEADERBOARD_HANDLES.slice(index, index + FETCH_CHUNK);
      const results = await Promise.allSettled(chunk.map((handle) => fetchLiveProfile(handle)));

      for (const result of results) {
        if (result.status === "fulfilled") {
          profiles.push(result.value);
        } else {
          log.warn("leaderboard profile skipped", {
            message: result.reason instanceof Error ? result.reason.message : "unknown",
          });
        }
      }
    }

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
