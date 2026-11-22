import { log } from "../logging/logger";
import type { CreatorProfile, Post } from "./types";

const ORIGIN = "https://www.instagram.com";
const USER_AGENT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const REQUEST_TIMEOUT_MS = 8000;
const WEB_PROFILE_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 100;
const EMBED_CONCURRENCY = 4;
const MAX_POSTS = 12;
const WEB_PROFILE_APP_ID = "936619743392459";
const PROXY_TIMEOUT_MS = 25_000;

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

const WEB_PROFILE_HEADERS = {
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  "x-ig-app-id": WEB_PROFILE_APP_ID,
};

const cache = new Map<string, { expiresAt: number; profile: CreatorProfile }>();

export type PublicIdentity = {
  isVerified: boolean;
  profilePictureUrl?: string;
};

// The Graph API's business_discovery does not expose the verified badge, so the
// profile page asks the public web profile for that single field. Keep it in a
// small, separate cache so each lookup costs at most one lightweight request.
const identityCache = new Map<string, { expiresAt: number; identity: PublicIdentity }>();
const IDENTITY_CACHE_TTL_MS = 30 * 60 * 1000;

function proxyEndpoint(): string {
  return process.env.INSTAGRAM_PROXY_URL?.trim() ?? "";
}

export function isProxyConfigured(): boolean {
  return proxyEndpoint().length > 0;
}

export type PublicErrorKind = "not_found" | "rate_limit" | "network" | "unreadable";

export class PublicProfileError extends Error {
  readonly kind: PublicErrorKind;

  constructor(kind: PublicErrorKind, message: string) {
    super(message);
    this.name = "PublicProfileError";
    this.kind = kind;
  }
}

const PROXY_MARKER = "x-instagram-proxy";

async function fetchInstagram(
  targetUrl: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<Response> {
  const endpoint = proxyEndpoint();

  if (endpoint) {
    let proxied: Response | null = null;
    try {
      const url = new URL(endpoint);
      url.searchParams.set("url", targetUrl);
      proxied = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${process.env.PROXY_SECRET?.trim() ?? ""}`,
          "x-proxy-key": process.env.PROXY_KEY?.trim() ?? "",
          Accept: "text/html,application/xhtml+xml,application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
      });
      log.info("instagram fetched through local proxy", {
        target: targetUrl,
        status: proxied.status,
      });
    } catch (error) {
      log.warn("instagram local proxy failed", {
        target: targetUrl,
        message: error instanceof Error ? error.message : "network",
      });
      // Fall back to a direct fetch for local development without a tunnel.
    }

    if (proxied) {
      // The proxy stamps every real response. A marker-less response comes from
      // the tunnel/CDN when no origin is connected, not from Instagram.
      if (proxied.headers.get(PROXY_MARKER) !== "ok") {
        log.warn("instagram proxy bridge unavailable", {
          target: targetUrl,
          status: proxied.status,
        });
        throw new PublicProfileError(
          "network",
          "The public lookup bridge is offline. Try again shortly.",
        );
      }
      if (proxied.status < 500 && ![401, 402, 403].includes(proxied.status)) {
        return proxied;
      }
      log.warn("instagram local proxy rejected", {
        target: targetUrl,
        status: proxied.status,
      });
    }
  }

  return fetch(targetUrl, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
}

type CaptionNode = { text?: string };

type PublicMediaNode = {
  pk?: string | number;
  id?: string | number;
  code?: string;
  shortcode?: string;
  taken_at?: number;
  taken_at_timestamp?: number;
  is_timeline_pinned?: boolean;
  media_type?: number;
  product_type?: string;
  caption?: CaptionNode | null;
  edge_media_to_caption?: { edges?: { node?: CaptionNode }[] };
  edge_liked_by?: { count?: number };
  edge_media_to_comment?: { count?: number };
  edge_media_to_parent_comment?: { count?: number };
  like_count?: number;
  comment_count?: number;
  comments_count?: number;
  video_view_count?: number;
  view_count?: number;
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
  edge_followed_by?: { count?: number };
  edge_follow?: { count?: number };
  edge_owner_to_timeline_media?: { count?: number; edges?: PublicEdge[] };
  timeline_media?: { count?: number; edges?: PublicEdge[] };
  profile_pic_url?: string;
  profile_pic_url_hd?: string;
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

function connectionCount(connection?: { count?: number }): number | undefined {
  return typeof connection?.count === "number" ? connection.count : undefined;
}

function followersOf(user: PublicUser | null): number | undefined {
  if (!user) {
    return undefined;
  }
  return user.follower_count ?? connectionCount(user.edge_followed_by);
}

function followingOf(user: PublicUser | null): number | undefined {
  if (!user) {
    return undefined;
  }
  return user.following_count ?? connectionCount(user.edge_follow);
}

function mediaCountOf(user: PublicUser | null): number | undefined {
  if (!user) {
    return undefined;
  }
  return (
    user.media_count ??
    connectionCount(user.edge_owner_to_timeline_media) ??
    connectionCount(user.timeline_media)
  );
}

function captionFromNode(node: PublicMediaNode): string {
  return (
    node.caption?.text?.trim() ||
    node.edge_media_to_caption?.edges?.[0]?.node?.text?.trim() ||
    "No caption."
  );
}

function shortcodeFromNode(node: PublicMediaNode): string | null {
  const direct = node.shortcode || node.code;
  if (direct) {
    return direct;
  }
  const pk = node.pk ?? node.id;
  if (pk === undefined || pk === null || pk === "") {
    return null;
  }
  try {
    return shortcodeFromPk(String(pk));
  } catch {
    return null;
  }
}

function postedAtFromNode(node: PublicMediaNode): string | null {
  if (typeof node.taken_at_timestamp === "number") {
    return new Date(node.taken_at_timestamp * 1000).toISOString();
  }
  if (typeof node.taken_at === "number") {
    return new Date(node.taken_at * 1000).toISOString();
  }
  const pk = node.pk ?? node.id;
  if (pk === undefined || pk === null || pk === "") {
    return null;
  }
  try {
    return postedAtFromPk(String(pk));
  } catch {
    return null;
  }
}

function likesFromNode(node: PublicMediaNode): number | undefined {
  if (typeof node.like_count === "number") {
    return node.like_count;
  }
  return connectionCount(node.edge_liked_by);
}

function commentsFromNode(node: PublicMediaNode): number | undefined {
  if (typeof node.comment_count === "number") {
    return node.comment_count;
  }
  if (typeof node.comments_count === "number") {
    return node.comments_count;
  }
  return (
    connectionCount(node.edge_media_to_comment) ??
    connectionCount(node.edge_media_to_parent_comment)
  );
}

function viewsFromNode(node: PublicMediaNode): number | undefined {
  return typeof node.video_view_count === "number"
    ? node.video_view_count
    : node.view_count;
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
    if (record.username === username && followersOf(record as PublicUser) !== undefined) {
      return record as PublicUser;
    }

    for (const value of Object.values(record)) {
      stack.push(value);
    }
  }

  return null;
}

function mediaEdgesFromUser(user: PublicUser | null): PublicEdge[] {
  const edges =
    user?.edge_owner_to_timeline_media?.edges ?? user?.timeline_media?.edges ?? [];
  return Array.isArray(edges) ? edges : [];
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
    const response = await fetchInstagram(
      `${ORIGIN}/p/${shortcode}/embed/captioned/`,
      HEADERS,
      REQUEST_TIMEOUT_MS,
    );

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

type WebProfileResult = {
  user: PublicUser | null;
  edges: PublicEdge[];
};

async function fetchWebProfile(username: string): Promise<WebProfileResult | null> {
  try {
    const response = await fetchInstagram(
      `${ORIGIN}/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      WEB_PROFILE_HEADERS,
      WEB_PROFILE_TIMEOUT_MS,
    );

    if (response.status === 404 || response.status === 429 || !response.ok) {
      log.warn("instagram web profile fallback rejected", {
        username,
        status: response.status,
      });
      return null;
    }

    const payload = await response.json();
    const user = findUser(payload, username);
    return { user, edges: mediaEdgesFromUser(user) };
  } catch (error) {
    log.warn("instagram web profile fallback failed", {
      username,
      message: error instanceof Error ? error.message : "network",
    });
    return null;
  }
}

type MediaCandidate = {
  shortcode: string;
  postedAt: string;
  mediaType: number | undefined;
  productType: string | undefined;
  caption: string;
  likes?: number;
  comments?: number;
  views?: number;
};

function buildCandidates(edges: PublicEdge[]): MediaCandidate[] {
  const candidates: MediaCandidate[] = [];

  for (const edge of edges) {
    const node = edge.node;
    if (!node || node.is_timeline_pinned) {
      continue;
    }

    const shortcode = shortcodeFromNode(node);
    const postedAt = postedAtFromNode(node);
    if (!shortcode || !postedAt) {
      continue;
    }

    const likes = likesFromNode(node);
    const comments = commentsFromNode(node);
    const views = viewsFromNode(node);

    candidates.push({
      shortcode,
      postedAt,
      mediaType: node.media_type,
      productType: node.product_type,
      caption: captionFromNode(node),
      ...(likes === undefined ? {} : { likes }),
      ...(comments === undefined ? {} : { comments }),
      ...(views === undefined ? {} : { views }),
    });

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

// Best-effort identity enrichment for live profiles. Business Discovery cannot
// return verification, so this reads only the public badge/picture. A failed or
// offline bridge simply leaves the live profile unchanged.
export async function fetchPublicIdentity(username: string): Promise<PublicIdentity | null> {
  const key = username.trim().replace(/^@/, "").toLowerCase();
  if (!isValidHandle(key)) {
    return null;
  }

  const cached = identityCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.identity;
  }

  // The signed proxy bridge serves the public HTML profile with a real
  // `is_verified` field; `web_profile_info` is blocked by Instagram's login wall.
  let user: PublicUser | null = null;
  try {
    const response = await fetchInstagram(
      `${ORIGIN}/${encodeURIComponent(key)}/`,
      HEADERS,
      REQUEST_TIMEOUT_MS,
    );
    if (response.ok) {
      user = parseProfileHtml(await response.text(), key).user;
    }
  } catch (error) {
    log.warn("public identity lookup failed", {
      username: key,
      message: error instanceof Error ? error.message : "network",
    });
    return null;
  }

  if (!user) {
    return null;
  }

  const identity: PublicIdentity = {
    isVerified: Boolean(user.is_verified),
    profilePictureUrl: user.profile_pic_url_hd?.trim() || user.profile_pic_url?.trim() || undefined,
  };
  identityCache.set(key, { expiresAt: Date.now() + IDENTITY_CACHE_TTL_MS, identity });
  if (identityCache.size > CACHE_MAX) {
    const oldest = identityCache.keys().next().value;
    if (oldest) {
      identityCache.delete(oldest);
    }
  }
  return identity;
}

export function clearPublicCache(): void {
  cache.clear();
  identityCache.clear();
}

type ParsedProfileHtml = {
  user: PublicUser | null;
  edges: PublicEdge[];
  ogStats: ReturnType<typeof parseOgStats>;
  ogTitle: string | null;
};

function parseProfileHtml(html: string, username: string): ParsedProfileHtml {
  const documents = parseJsonScripts(html);
  let user: PublicUser | null = null;
  let edges: PublicEdge[] = [];

  for (const document of documents) {
    if (!user) {
      user = findUser(document, username);
    }
    if (edges.length === 0) {
      edges = findMediaEdges(document);
    }
    if (user && edges.length > 0) {
      break;
    }
  }

  return {
    user,
    edges,
    ogStats: parseOgStats(html),
    ogTitle: metaContent(html, "og:title"),
  };
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

  const profileUrl = `${ORIGIN}/${encodeURIComponent(key)}/`;

  async function requestProfilePage(): Promise<Response> {
    try {
      return await fetchInstagram(profileUrl, HEADERS, REQUEST_TIMEOUT_MS);
    } catch (error) {
      if (error instanceof PublicProfileError) {
        throw error;
      }
      log.error("instagram public fetch failed", {
        username: key,
        message: error instanceof Error ? error.message : "network",
      });
      throw new PublicProfileError(
        "network",
        "Could not reach Instagram. Check the network and try again.",
      );
    }
  }

  let response = await requestProfilePage();

  // Scraper proxies occasionally return a transient 404/429 for a valid handle.
  // One fresh request prevents a false "Profile not found" on Vercel.
  if (isProxyConfigured() && (response.status === 404 || response.status === 429)) {
    log.warn("retrying instagram public lookup", { username: key, status: response.status });
    response = await requestProfilePage();
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

  let html = await response.text();
  let { user, edges, ogStats, ogTitle } = parseProfileHtml(html, key);

  // A scraper can return a metadata-free app shell for a real account. Retry once
  // through a fresh proxy before treating the handle as genuinely missing.
  if (!user && !ogTitle && isProxyConfigured()) {
    log.warn("instagram public profile was empty; retrying", {
      username: key,
      length: html.length,
    });
    const retry = await requestProfilePage();
    if (retry.status === 429) {
      throw new PublicProfileError(
        "rate_limit",
        "Instagram is temporarily limiting public lookups. Try again in a few minutes.",
      );
    }
    if (retry.ok) {
      html = await retry.text();
      ({ user, edges, ogStats, ogTitle } = parseProfileHtml(html, key));
    }
  }

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

  let isPrivate = Boolean(user?.is_private);

  // Instagram sometimes serves logged-out crawler pages with zero preloaded
  // posts. The public web-profile endpoint is a second source for the same
  // data; it also carries inline engagement, avoiding extra embed requests.
  if (!isPrivate && edges.length === 0) {
    const webProfile = await fetchWebProfile(key);
    if (webProfile) {
      if (webProfile.user && (!user || followersOf(user) === undefined)) {
        user = webProfile.user;
      }
      isPrivate = Boolean(isPrivate || user?.is_private);
      edges = webProfile.edges;
    }
  }

  const candidates = isPrivate ? [] : buildCandidates(edges);
  const missingEmbeds = candidates
    .filter((candidate) => candidate.likes === undefined || candidate.comments === undefined)
    .map((candidate) => candidate.shortcode);
  const embedMetrics =
    missingEmbeds.length > 0 ? await fetchEmbeds(missingEmbeds) : new Map<string, EmbedMetrics>();

  const recentPosts: Post[] = [];
  let skipped = 0;

  for (const candidate of candidates) {
    const metrics = embedMetrics.get(candidate.shortcode);
    const likes = candidate.likes ?? metrics?.likes;
    const comments = candidate.comments ?? metrics?.comments;
    if (likes === undefined && comments === undefined) {
      skipped += 1;
      continue;
    }

    recentPosts.push({
      id: candidate.shortcode,
      type: mapMediaType(candidate.mediaType, candidate.productType),
      caption: candidate.caption,
      postedAt: candidate.postedAt,
      likes: likes ?? 0,
      comments: comments ?? 0,
      viewCount: candidate.views ?? metrics?.views,
      permalink: `${ORIGIN}/p/${candidate.shortcode}/`,
      hashtags: extractHashtags(candidate.caption),
    });
  }

  const profile: CreatorProfile = {
    username: user?.username || key,
    displayName: user?.full_name?.trim() || displayNameFromTitle(html, key),
    category: preferredCategory(user),
    bio: user?.biography?.trim() || "No biography provided.",
    followers: Math.max(0, followersOf(user) ?? ogStats.followers ?? 0),
    following: Math.max(0, followingOf(user) ?? ogStats.following ?? 0),
    postsCount: Math.max(0, ogStats.posts ?? mediaCountOf(user) ?? edges.length),
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
    via: isProxyConfigured() ? "proxy" : "direct",
  });

  return profile;
}
