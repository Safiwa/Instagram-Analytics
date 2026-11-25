import type { CreatorProfile, Post, StoredEngagement } from "../data/types";
import { log } from "../logging/logger";
import { getSql, type SqlRow } from "./client";

// Read side of the in-house index: everything here is built from snapshots this
// site stored itself. Every reader fails soft (empty/null) so a database outage
// only hides index-based panels and never breaks a page.

const INDEX_MAX_AGE_DAYS = 30;
const STORED_ENGAGEMENT_MAX_AGE_DAYS = 60;
const POSTS_PER_PROFILE = 12;

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalize(handle: string): string {
  return handle.trim().replace(/^@/, "").toLowerCase();
}

async function query(label: string, text: string, params: unknown[]): Promise<SqlRow[] | null> {
  const sql = getSql();
  if (!sql) {
    return null;
  }
  try {
    return await sql(text, params);
  } catch (error) {
    log.warn("index read failed", {
      query: label,
      message: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Stored engagement: the latest snapshot that had visible posts.

const SELECT_STORED_ENGAGEMENT = `
select s.captured_on::text as measured_on, s.engagement_rate, s.avg_likes, s.avg_comments
from profiles p
join profile_snapshots s on s.profile_id = p.id
where p.username = $1
  and s.engagement_rate is not null
  and s.captured_on >= current_date - $2::int
order by s.captured_on desc
limit 1`;

export async function loadStoredEngagement(username: string): Promise<StoredEngagement | null> {
  const rows = await query("stored-engagement", SELECT_STORED_ENGAGEMENT, [
    normalize(username),
    STORED_ENGAGEMENT_MAX_AGE_DAYS,
  ]);
  const row = rows?.[0];
  const measuredOn = toText(row?.measured_on);
  const engagementRatePct = toNumber(row?.engagement_rate);
  if (!row || !measuredOn || engagementRatePct === null) {
    return null;
  }
  return {
    measuredOn,
    engagementRatePct,
    averageLikes: toNumber(row.avg_likes) ?? 0,
    averageComments: toNumber(row.avg_comments) ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Benchmark sample: latest measured engagement per profile.

export type IndexSamplePoint = {
  username: string;
  followers: number;
  engagementRate: number;
};

const SELECT_SAMPLE = `
select distinct on (p.id) p.username, s.followers, s.engagement_rate
from profiles p
join profile_snapshots s on s.profile_id = p.id
where s.engagement_rate is not null
  and s.captured_on >= current_date - $1::int
order by p.id, s.captured_on desc`;

export async function loadIndexSample(): Promise<IndexSamplePoint[]> {
  const rows = await query("benchmark-sample", SELECT_SAMPLE, [INDEX_MAX_AGE_DAYS]);
  const sample: IndexSamplePoint[] = [];
  for (const row of rows ?? []) {
    const followers = toNumber(row.followers);
    const engagementRate = toNumber(row.engagement_rate);
    const username = toText(row.username);
    if (username && followers !== null && engagementRate !== null) {
      sample.push({ username, followers, engagementRate });
    }
  }
  return sample;
}

// ---------------------------------------------------------------------------
// Indexed profiles rebuilt as CreatorProfile objects (latest snapshot + posts).

const SELECT_PROFILES = `
select
  p.username, p.display_name, p.category, p.account_country, p.is_verified,
  p.is_private, p.profile_picture_url, p.bio, p.instagram_id,
  s.followers, s.following, s.posts_count, s.source, s.captured_on::text as captured_on,
  coalesce((
    select json_agg(item order by item.posted_at desc nulls last)
    from (
      select po.instagram_id, po.type, po.posted_at, po.permalink, po.caption,
             po.hashtags, po.location, ps.likes, ps.comments, ps.views
      from posts po
      join lateral (
        select likes, comments, views from post_snapshots
        where post_id = po.id order by captured_on desc limit 1
      ) ps on true
      where po.profile_id = p.id
      order by po.posted_at desc nulls last
      limit ${POSTS_PER_PROFILE}
    ) item
  ), '[]'::json) as posts
from profiles p
join lateral (
  select * from profile_snapshots where profile_id = p.id order by captured_on desc limit 1
) s on true
where s.captured_on >= current_date - $1::int
  and ($2::text[] is null or p.username = any($2::text[]))
order by s.followers desc
limit $3`;

function toPost(item: Record<string, unknown>): Post | null {
  const id = toText(item.instagram_id);
  const type = item.type;
  if (!id || (type !== "Reel" && type !== "Carousel" && type !== "Photo" && type !== "Video")) {
    return null;
  }
  const likes = toNumber(item.likes);
  const views = toNumber(item.views);
  const postedAt = toText(item.posted_at);
  return {
    id,
    type,
    caption: toText(item.caption) ?? "",
    postedAt: postedAt ? new Date(postedAt).toISOString() : "",
    likes: likes ?? 0,
    ...(likes === null ? { likesHidden: true } : {}),
    comments: toNumber(item.comments) ?? 0,
    ...(views !== null ? { viewCount: views } : {}),
    ...(toText(item.permalink) ? { permalink: item.permalink as string } : {}),
    hashtags: Array.isArray(item.hashtags)
      ? item.hashtags.filter((tag): tag is string => typeof tag === "string")
      : [],
    ...(toText(item.location) ? { location: item.location as string } : {}),
  };
}

function toProfile(row: SqlRow): CreatorProfile | null {
  const username = toText(row.username);
  const followers = toNumber(row.followers);
  if (!username || followers === null) {
    return null;
  }
  const rawPosts = typeof row.posts === "string" ? JSON.parse(row.posts) : row.posts;
  const recentPosts = (Array.isArray(rawPosts) ? rawPosts : [])
    .map((item) => toPost(item as Record<string, unknown>))
    .filter((post): post is Post => post !== null);
  return {
    username,
    displayName: toText(row.display_name) ?? username,
    category: toText(row.category) ?? "Instagram account",
    bio: toText(row.bio) ?? "",
    ...(toText(row.instagram_id) ? { instagramId: row.instagram_id as string } : {}),
    followers,
    following: toNumber(row.following) ?? 0,
    postsCount: toNumber(row.posts_count) ?? 0,
    isVerified: row.is_verified === true,
    ...(row.is_verified === null ? { verificationUnknown: true } : {}),
    isPrivate: row.is_private === true,
    source: row.source === "live" ? "live" : "public",
    ...(toText(row.profile_picture_url) ? { profilePictureUrl: row.profile_picture_url as string } : {}),
    accountCountry: toText(row.account_country),
    followerHistory: [],
    recentPosts,
  };
}

export async function loadIndexedProfiles(
  options: { usernames?: readonly string[]; limit?: number } = {},
): Promise<CreatorProfile[]> {
  const usernames = options.usernames ? options.usernames.map(normalize) : null;
  if (usernames && usernames.length === 0) {
    return [];
  }
  const rows = await query("indexed-profiles", SELECT_PROFILES, [
    INDEX_MAX_AGE_DAYS,
    usernames,
    options.limit ?? 500,
  ]);
  return (rows ?? []).map(toProfile).filter((profile): profile is CreatorProfile => profile !== null);
}

// ---------------------------------------------------------------------------
// Discover search.

export type DiscoverSort = "followers" | "engagement" | "recent";

export type DiscoverFilters = {
  query?: string;
  country?: string;
  minFollowers?: number;
  maxFollowers?: number;
  sort?: DiscoverSort;
  limit?: number;
};

export type DiscoverRow = {
  username: string;
  displayName: string;
  category: string;
  country: string | null;
  isVerified: boolean;
  profilePictureUrl: string | null;
  followers: number;
  engagementRate: number | null;
  avgLikes: number | null;
  capturedOn: string;
};

const SORT_SQL: Record<DiscoverSort, string> = {
  followers: "s.followers desc",
  engagement: "s.engagement_rate desc nulls last, s.followers desc",
  recent: "p.last_snapshot_at desc nulls last",
};

function discoverSql(sort: DiscoverSort): string {
  return `
select
  p.username, p.display_name, p.category, p.account_country, p.is_verified,
  p.profile_picture_url, s.followers, s.engagement_rate, s.avg_likes,
  s.captured_on::text as captured_on
from profiles p
join lateral (
  select * from profile_snapshots where profile_id = p.id order by captured_on desc limit 1
) s on true
where not p.is_private
  and s.captured_on >= current_date - $1::int
  and ($2::text is null
       or p.username ilike '%' || $2 || '%'
       or p.display_name ilike '%' || $2 || '%'
       or p.category ilike '%' || $2 || '%')
  and ($3::text is null or p.account_country = $3)
  and ($4::bigint is null or s.followers >= $4)
  and ($5::bigint is null or s.followers < $5)
order by ${SORT_SQL[sort]}
limit $6`;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function searchIndex(filters: DiscoverFilters): Promise<DiscoverRow[]> {
  const sort = filters.sort && filters.sort in SORT_SQL ? filters.sort : "followers";
  const text = filters.query?.trim().replace(/^@/, "");
  const rows = await query("discover", discoverSql(sort), [
    INDEX_MAX_AGE_DAYS,
    text ? escapeLike(text.slice(0, 60)) : null,
    filters.country?.trim() || null,
    filters.minFollowers ?? null,
    filters.maxFollowers ?? null,
    Math.min(Math.max(filters.limit ?? 50, 1), 100),
  ]);
  const results: DiscoverRow[] = [];
  for (const row of rows ?? []) {
    const username = toText(row.username);
    const followers = toNumber(row.followers);
    const capturedOn = toText(row.captured_on);
    if (!username || followers === null || !capturedOn) {
      continue;
    }
    results.push({
      username,
      displayName: toText(row.display_name) ?? username,
      category: toText(row.category) ?? "Instagram account",
      country: toText(row.account_country),
      isVerified: row.is_verified === true,
      profilePictureUrl: toText(row.profile_picture_url),
      followers,
      engagementRate: toNumber(row.engagement_rate),
      avgLikes: toNumber(row.avg_likes),
      capturedOn,
    });
  }
  return results;
}

const SELECT_COUNTRIES = `
select account_country as country, count(*)::int as profiles
from profiles
where account_country is not null and last_snapshot_at >= now() - ($1::int * interval '1 day')
group by account_country
order by profiles desc, account_country asc`;

export async function listIndexCountries(): Promise<{ country: string; profiles: number }[]> {
  const rows = await query("countries", SELECT_COUNTRIES, [INDEX_MAX_AGE_DAYS]);
  return (rows ?? [])
    .map((row) => ({ country: toText(row.country), profiles: toNumber(row.profiles) ?? 0 }))
    .filter((row): row is { country: string; profiles: number } => row.country !== null);
}

const SELECT_INDEX_SIZE = `
select count(*)::int as profiles
from profiles
where last_snapshot_at >= now() - ($1::int * interval '1 day')`;

export async function countIndexedProfiles(): Promise<number | null> {
  const rows = await query("index-size", SELECT_INDEX_SIZE, [INDEX_MAX_AGE_DAYS]);
  return rows ? (toNumber(rows[0]?.profiles) ?? 0) : null;
}

// ---------------------------------------------------------------------------
// Shared, briefly cached sample for benchmarks (home panel + profile pages).

const SAMPLE_CACHE_MS = 10 * 60 * 1000;
let sampleCache: { expiresAt: number; value: Promise<IndexSamplePoint[]> } | null = null;

export function getIndexSample(): Promise<IndexSamplePoint[]> {
  if (sampleCache && sampleCache.expiresAt > Date.now()) {
    return sampleCache.value;
  }
  const value = loadIndexSample();
  sampleCache = { expiresAt: Date.now() + SAMPLE_CACHE_MS, value };
  return value;
}

export function clearIndexCacheForTests(): void {
  sampleCache = null;
}
