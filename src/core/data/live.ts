import { log } from "../logging/logger";
import type { CreatorProfile, Post } from "./types";

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 100;
const cache = new Map<string, { expiresAt: number; profile: CreatorProfile }>();

export type LiveErrorKind = "config" | "not_found" | "auth" | "rate_limit" | "api";

export class LiveProfileError extends Error {
  readonly kind: LiveErrorKind;

  constructor(kind: LiveErrorKind, message: string) {
    super(message);
    this.name = "LiveProfileError";
    this.kind = kind;
  }
}

function config() {
  return {
    token: process.env.IG_ACCESS_TOKEN?.trim(),
    accountId: process.env.IG_BUSINESS_ACCOUNT_ID?.trim(),
    version: process.env.IG_GRAPH_VERSION?.trim() || "v27.0",
  };
}

export function isLiveConfigured(): boolean {
  const { token, accountId } = config();
  return Boolean(token && accountId);
}

type IgMedia = {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  like_count?: number;
  comments_count?: number;
  timestamp?: string;
  permalink?: string;
  view_count?: number;
};

type IgBusinessDiscovery = {
  id: string;
  username?: string;
  name?: string;
  biography?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
  profile_picture_url?: string;
  website?: string;
  media?: { data?: IgMedia[] };
};

type IgError = {
  message?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
};

type IgResponse = {
  business_discovery?: IgBusinessDiscovery;
  error?: IgError;
};

function mapMediaType(media: IgMedia): Post["type"] {
  if (media.media_product_type === "REELS") {
    return "Reel";
  }
  if (media.media_type === "CAROUSEL_ALBUM") {
    return "Carousel";
  }
  if (media.media_type === "VIDEO") {
    return "Video";
  }
  return "Photo";
}

function extractHashtags(caption: string): string[] {
  return caption.match(/#[\p{L}\p{N}_]+/gu) ?? [];
}

function mapPost(media: IgMedia): Post {
  const caption = media.caption?.trim() || "No caption.";

  return {
    id: media.id,
    type: mapMediaType(media),
    caption,
    postedAt: media.timestamp ?? new Date().toISOString(),
    likes: Math.max(0, media.like_count ?? 0),
    comments: Math.max(0, media.comments_count ?? 0),
    viewCount: typeof media.view_count === "number" ? media.view_count : undefined,
    permalink: media.permalink,
    hashtags: extractHashtags(caption),
  };
}

function mapProfile(data: IgBusinessDiscovery, fallbackUsername: string): CreatorProfile {
  const media = data.media?.data ?? [];
  const username = data.username || fallbackUsername;

  return {
    username,
    displayName: data.name?.trim() || username,
    category: "Instagram Professional",
    bio: data.biography?.trim() || "No biography provided.",
    followers: Math.max(0, data.followers_count ?? 0),
    following: Math.max(0, data.follows_count ?? 0),
    postsCount: Math.max(0, data.media_count ?? media.length),
    isVerified: false,
    source: "live",
    profilePictureUrl: data.profile_picture_url,
    website: data.website,
    followerHistory: [],
    recentPosts: media.slice(0, 12).map(mapPost),
    audience: undefined,
  };
}

function mapError(error: IgError | undefined, status: number, username: string): LiveProfileError {
  const code = error?.code;

  if (code === 190) {
    return new LiveProfileError(
      "auth",
      "Instagram access token is invalid or expired. Refresh IG_ACCESS_TOKEN in .env.local.",
    );
  }
  if (code === 4 || code === 17 || code === 32 || code === 613) {
    return new LiveProfileError(
      "rate_limit",
      "Instagram API rate limit reached. Try again in a few minutes.",
    );
  }
  if (code === 100 || status === 404) {
    return new LiveProfileError(
      "not_found",
      `No Instagram Business or Creator account found for @${username}. Personal accounts are not supported by Business Discovery.`,
    );
  }

  return new LiveProfileError(
    "api",
    error?.message || `Instagram API request failed with HTTP ${status}.`,
  );
}

export async function fetchLiveProfile(username: string): Promise<CreatorProfile> {
  const { token, accountId, version } = config();

  if (!token || !accountId) {
    throw new LiveProfileError("config", "Live Instagram lookup is not configured.");
  }

  const key = username.toLowerCase();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.profile;
  }

  const url = new URL(`https://graph.facebook.com/${version}/${accountId}`);
  const fields = [
    `business_discovery.username(${username}){`,
    "id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website,",
    "media.limit(12){id,caption,media_type,media_product_type,like_count,comments_count,timestamp,permalink,view_count}",
    "}",
  ].join("");
  url.searchParams.set("fields", fields);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    log.error("instagram live fetch failed", {
      username: key,
      message: error instanceof Error ? error.message : "network",
    });
    throw new LiveProfileError("api", "Could not reach Instagram. Check the network and try again.");
  }

  let data: IgResponse;
  try {
    data = (await response.json()) as IgResponse;
  } catch {
    log.warn("instagram live response was not JSON", { username: key, status: response.status });
    throw new LiveProfileError("api", "Instagram returned an unreadable response.");
  }

  if (!response.ok || data.error || !data.business_discovery) {
    const mapped = mapError(data.error, response.status, key);
    log.warn("instagram live lookup rejected", {
      username: key,
      code: data.error?.code ?? response.status,
      kind: mapped.kind,
    });
    throw mapped;
  }

  const profile = mapProfile(data.business_discovery, key);
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, profile });
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) {
      cache.delete(oldest);
    }
  }

  log.info("instagram live profile loaded", {
    username: key,
    posts: profile.recentPosts.length,
  });

  return profile;
}
