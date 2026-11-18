import { log } from "../logging/logger";
import type { CreatorProfile, Post } from "./types";

const ORIGIN = "https://www.instagram.com";
const USER_AGENT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const REQUEST_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 100;
const EMBED_CONCURRENCY = 4;
const MAX_POSTS = 12;

const SHORTCODE_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const PK_EPOCH_MS = BigInt(1314220021721);
const PK_SHIFT = BigInt(23);
const BASE_64 = BigInt(64);
const ZERO = BigInt(0);

const HEADERS = {
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent": USER_AGENT,
};

const cache = new Map<string, { expiresAt: number; profile: CreatorProfile }>();

export type PublicErrorKind = "not_found" | "rate_limit" | "network" | "unreadable";

export class PublicProfileError extends Error {
  readonly kind: PublicErrorKind;

  constructor(kind: PublicErrorKind, message: string) {
    super(message);
    this.name = "PublicProfileError";
    this.kind = kind;
  }
}

type PublicMediaNode = {
  pk?: string | number;
  is_timeline_pinned?: boolean;
  media_type?: number;
  product_type?: string;
  caption?: { text?: string } | null;
};

type PublicEdge = { node?: PublicMediaNode };

type PublicUser = {
  username?: string;
  full_name?: string;
  biography?: string;
  is_verified?: boolean;
  is_private?: boolean;
  follower_count?: number;
  following_count?: number;
  media_count?: number;
  profile_pic_url?: string;
  external_url?: string;
  bio_links?: { url?: string }[];
  category_name?: string;
  business_category_name?: string;
};

type EmbedMetrics = {
  likes: number;
  comments: number;
  views?: number;
};

function isValidHandle(value: string): boolean {
  return /^[a-z0-9._]{1,30}$/.test(value);
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function metaContent(html: string, key: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const property = tag.match(/(?:property|name)="([^"]+)"/i)?.[1];
    if (property?.toLowerCase() !== key.toLowerCase()) {
      continue;
    }
    const content = tag.match(/content="([^"]*)"/i)?.[1];
    if (content) {
      return decodeHtml(content);
    }
  }
  return null;
}

function parseCompact(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const match = value.replace(/,/g, "").trim().match(/^([\d.]+)\s*([KMB])?$/i);
  if (!match) {
    return null;
  }
  const base = Number(match[1]);
  if (!Number.isFinite(base)) {
    return null;
  }
  const suffix = match[2]?.toUpperCase();
  const multiplier =
    suffix === "K" ? 1_000 : suffix === "M" ? 1_000_000 : suffix === "B" ? 1_000_000_000 : 1;
  return Math.round(base * multiplier);
}

function parseOgStats(html: string): {
  followers: number | null;
  following: number | null;
  posts: number | null;
} {
  const description = metaContent(html, "og:description") ?? "";
  const match = description.match(
    /([\d.,]+[KMB]?)\s+Followers?,\s*([\d.,]+[KMB]?)\s+Following,\s*([\d.,]+[KMB]?)\s+Posts?/i,
  );
  return {
    followers: match ? parseCompact(match[1]) : null,
    following: match ? parseCompact(match[2]) : null,
    posts: match ? parseCompact(match[3]) : null,
  };
}

function parseJsonScripts(html: string): unknown[] {
  const documents: unknown[] = [];
  const pattern = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    try {
      documents.push(JSON.parse(match[1]));
    } catch {
      // Some script tags carry fragments rather than complete JSON documents.
    }
  }

  return documents;
}

function findUser(root: unknown, username: string): PublicUser | null {
  const seen = new Set<object>();
  const stack: unknown[] = [root];
  let visited = 0;

  while (stack.length > 0 && visited < 200_000) {
    const node = stack.pop();
    if (!node || typeof node !== "object" || seen.has(node)) {
      continue;
    }
    seen.add(node);
    visited += 1;

    const record = node as Record<string, unknown>;
    if (
      record.username === username &&
      typeof record.follower_count === "number"
    ) {
      return record as PublicUser;
    }

    for (const value of Object.values(record)) {
      stack.push(value);
    }
  }

  return null;
}

function findMediaEdges(root: unknown): PublicEdge[] {
  const seen = new Set<object>();
  const stack: unknown[] = [root];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== "object" || seen.has(node)) {
      continue;
    }
    seen.add(node);

    const record = node as Record<string, unknown>;
    const connection = record.polaris_timeline_connection as
      | { edges?: PublicEdge[] }
      | undefined;
    if (connection && Array.isArray(connection.edges)) {
      return connection.edges;
    }

    for (const value of Object.values(record)) {
      stack.push(value);
    }
  }

  return [];
}

export function shortcodeFromPk(pk: string): string {
  let value = BigInt(pk);
  let output = "";

  do {
    output = SHORTCODE_ALPHABET[Number(value % BASE_64)] + output;
    value /= BASE_64;
  } while (value > ZERO);

  return output;
}

export function postedAtFromPk(pk: string): string {
  const milliseconds = (BigInt(pk) >> PK_SHIFT) + PK_EPOCH_MS;
  return new Date(Number(milliseconds)).toISOString();
}

function mapMediaType(mediaType: number | undefined, productType: string | undefined): Post["type"] {
  if (mediaType === 8) {
    return "Carousel";
  }
  if (mediaType === 2) {
    return productType === "clips" ? "Reel" : "Video";
  }
  return "Photo";
}

function extractHashtags(caption: string): string[] {
  return caption.match(/#[\p{L}\p{N}_]+/gu) ?? [];
}

function countFromPattern(html: string, pattern: RegExp): number | null {
  const match = html.match(pattern);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  return Number.isInteger(value) ? value : null;
}

function parseEmbed(html: string): EmbedMetrics | null {
  const likes =
    countFromPattern(
      html,
      /\\?"edge_liked_by\\?"\s*:\s*\{\s*\\?"count\\?"\s*:\s*(\d+)/,
    ) ?? parseCompact(html.match(/([\d.,]+[KMB]?)\s+likes?\b/i)?.[1]);
  const comments =
    countFromPattern(
      html,
      /\\?"edge_media_to_comment\\?"\s*:\s*\{\s*\\?"count\\?"\s*:\s*(\d+)/,
    ) ??
    parseCompact(html.match(/View all ([\d.,]+[KMB]?)\s+comments?/i)?.[1]) ??
    parseCompact(html.match(/([\d.,]+[KMB]?)\s+comments?\b/i)?.[1]);
  const views = countFromPattern(html, /\\?"video_view_count\\?"\s*:\s*(\d+)/) ?? undefined;

  if (likes === null && comments === null) {
    return null;
  }

  return {
    likes: likes ?? 0,
    comments: comments ?? 0,
    views,
  };
}

async function fetchEmbed(shortcode: string): Promise<EmbedMetrics | null> {
  try {
    const response = await fetch(`${ORIGIN}/p/${shortcode}/embed/captioned/`, {
      headers: HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    return parseEmbed(await response.text());
  } catch {
    return null;
  }
}

async function fetchEmbeds(shortcodes: string[]): Promise<Map<string, EmbedMetrics>> {
  const metrics = new Map<string, EmbedMetrics>();

  for (let index = 0; index < shortcodes.length; index += EMBED_CONCURRENCY) {
    const batch = shortcodes.slice(index, index + EMBED_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (shortcode) => {
        const result = await fetchEmbed(shortcode);
        return { shortcode, result };
      }),
    );

    for (const { shortcode, result } of results) {
      if (result) {
        metrics.set(shortcode, result);
      }
    }
  }

  return metrics;
}

type MediaCandidate = {
  shortcode: string;
  postedAt: string;
  mediaType: number | undefined;
  productType: string | undefined;
  caption: string;
};

function buildCandidates(edges: PublicEdge[]): MediaCandidate[] {
  const candidates: MediaCandidate[] = [];

  for (const edge of edges) {
    const node = edge.node;
    if (!node?.pk || node.is_timeline_pinned) {
      continue;
    }

    try {
      const pk = String(node.pk);
      candidates.push({
        shortcode: shortcodeFromPk(pk),
        postedAt: postedAtFromPk(pk),
        mediaType: node.media_type,
        productType: node.product_type,
        caption: node.caption?.text?.trim() || "No caption.",
      });
    } catch {
      // Ignore nodes whose media id cannot be decoded.
    }

    if (candidates.length >= MAX_POSTS) {
      break;
    }
  }

  return candidates;
}

function displayNameFromTitle(html: string, username: string): string {
  const title = metaContent(html, "og:title");
  if (!title) {
    return username;
  }

  return (
    title
      .replace(/\s*\(@[^)]*\).*$/i, "")
      .replace(/\s*[•|].*$/, "")
      .trim() || username
  );
}

function preferredWebsite(user: PublicUser | null): string | undefined {
  if (!user) {
    return undefined;
  }

  return (
    user.external_url?.trim() ||
    user.bio_links?.map((link) => link.url?.trim()).find((url) => Boolean(url)) ||
    undefined
  );
}

function preferredCategory(user: PublicUser | null): string {
  const category =
    user?.category_name?.trim() ||
    user?.business_category_name?.replace(/_/g, " ").trim() ||
    "";
  return category || "Instagram creator";
}

export function clearPublicCache(): void {
  cache.clear();
}

export async function fetchPublicProfile(username: string): Promise<CreatorProfile> {
  const key = username.trim().replace(/^@/, "").toLowerCase();

  if (!isValidHandle(key)) {
    throw new PublicProfileError(
      "not_found",
      "Enter a valid Instagram username: letters, numbers, dots, or underscores.",
    );
  }

  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.profile;
  }

  let response: Response;
  try {
    response = await fetch(`${ORIGIN}/${encodeURIComponent(key)}/`, {
      headers: HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    log.error("instagram public fetch failed", {
      username: key,
      message: error instanceof Error ? error.message : "network",
    });
    throw new PublicProfileError(
      "network",
      "Could not reach Instagram. Check the network and try again.",
    );
  }

  if (response.status === 404) {
    throw new PublicProfileError(
      "not_found",
      `No public Instagram profile found for @${key}. Check the spelling and try again.`,
    );
  }

  if (response.status === 429) {
    log.warn("instagram public lookup rate limited", { username: key });
    throw new PublicProfileError(
      "rate_limit",
      "Instagram is temporarily limiting public lookups. Try again in a few minutes.",
    );
  }

  if (!response.ok) {
    log.warn("instagram public lookup rejected", { username: key, status: response.status });
    throw new PublicProfileError(
      "unreadable",
      "Instagram returned a page that could not be read. Try again in a moment.",
    );
  }

  const html = await response.text();
  const documents = parseJsonScripts(html);
  let user: PublicUser | null = null;
  let edges: PublicEdge[] = [];

  for (const document of documents) {
    if (!user) {
      user = findUser(document, key);
    }
    if (edges.length === 0) {
      edges = findMediaEdges(document);
    }
    if (user && edges.length > 0) {
      break;
    }
  }

  const ogStats = parseOgStats(html);
  const ogTitle = metaContent(html, "og:title");

  if (!user && !ogTitle) {
    // Instagram answers unknown handles with a generic 200 app shell that has no
    // profile metadata. Treat that as not found instead of a transient error.
    log.warn("instagram public profile was empty", {
      username: key,
      length: html.length,
    });
    throw new PublicProfileError(
      "not_found",
      `No public Instagram profile found for @${key}. Check the spelling and try again.`,
    );
  }

  const isPrivate = Boolean(user?.is_private);
  const candidates = isPrivate ? [] : buildCandidates(edges);
  const embedMetrics = await fetchEmbeds(candidates.map((candidate) => candidate.shortcode));

  const recentPosts: Post[] = [];
  let skipped = 0;

  for (const candidate of candidates) {
    const metrics = embedMetrics.get(candidate.shortcode);
    if (!metrics) {
      skipped += 1;
      continue;
    }

    recentPosts.push({
      id: candidate.shortcode,
      type: mapMediaType(candidate.mediaType, candidate.productType),
      caption: candidate.caption,
      postedAt: candidate.postedAt,
      likes: metrics.likes,
      comments: metrics.comments,
      viewCount: metrics.views,
      permalink: `${ORIGIN}/p/${candidate.shortcode}/`,
      hashtags: extractHashtags(candidate.caption),
    });
  }

  const profile: CreatorProfile = {
    username: user?.username || key,
    displayName: user?.full_name?.trim() || displayNameFromTitle(html, key),
    category: preferredCategory(user),
    bio: user?.biography?.trim() || "No biography provided.",
    followers: Math.max(0, user?.follower_count ?? ogStats.followers ?? 0),
    following: Math.max(0, user?.following_count ?? ogStats.following ?? 0),
    postsCount: Math.max(0, ogStats.posts ?? user?.media_count ?? edges.length),
    isVerified: Boolean(user?.is_verified),
    isPrivate,
    source: "public",
    profilePictureUrl: user?.profile_pic_url,
    website: preferredWebsite(user),
    followerHistory: [],
    recentPosts,
    audience: undefined,
  };

  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, profile });
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) {
      cache.delete(oldest);
    }
  }

  if (skipped > 0) {
    log.warn("instagram public embeds incomplete", { username: key, skipped });
  }
  log.info("instagram public profile loaded", {
    username: key,
    posts: recentPosts.length,
    private: isPrivate ? "yes" : "no",
  });

  return profile;
}
