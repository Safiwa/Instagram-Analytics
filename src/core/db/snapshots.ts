import { computeMetrics } from "../analytics/metrics";
import type { CreatorProfile, DailyPoint, Post, TrackingHistory } from "../data/types";
import { log } from "../logging/logger";
import { getSql } from "./client";

export type RecordOptions = {
  // A visitor looked this profile up (counts towards lookup_count/last_lookup_at).
  lookup?: boolean;
  // Keep this profile in the daily collector's rotation.
  tracked?: boolean;
  now?: Date;
};

const HISTORY_DAYS = 400;

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number | null, digits: number): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

// The public reader and the official API use different post ids. The shortcode
// in the permalink is shared by both, so it keeps one row per real post.
export function postKey(post: Post): string {
  const match = post.permalink?.match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  return match?.[1] ?? post.id;
}

// Only values measured from Instagram today are stored. A stored-engagement
// fallback (shown when Instagram hides every post) is never written back.
export function snapshotValues(profile: CreatorProfile) {
  const posts = profile.recentPosts;
  const metrics = computeMetrics({ ...profile, storedEngagement: undefined });
  const measured = metrics.engagementSource === "public-posts";
  const views = posts
    .map((post) => post.viewCount)
    .filter((value): value is number => typeof value === "number");

  return {
    followers: profile.followers,
    following: profile.following,
    postsCount: profile.postsCount,
    engagementRate: measured ? round(metrics.engagementRate, 4) : null,
    avgLikes: measured ? round(metrics.avgLikes, 2) : null,
    avgComments: measured ? round(metrics.avgComments, 2) : null,
    avgViews: round(average(views), 2),
    visiblePosts: posts.length,
  };
}

// Placeholder biographies written by the data adapters are not stored.
function storableBio(bio: string | undefined): string | null {
  const text = bio?.trim();
  if (!text || text === "No biography provided.") {
    return null;
  }
  return text.slice(0, 500);
}

function storableInstagramId(id: string | undefined): string | null {
  return id && /^[0-9]{1,25}$/.test(id) ? id : null;
}

const UPSERT_PROFILE = `
insert into profiles (
  username, display_name, category, account_country, is_verified, is_private,
  profile_picture_url, tracked, lookup_count, last_lookup_at, last_snapshot_at,
  bio, instagram_id
) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
on conflict (username) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  account_country = coalesce(excluded.account_country, profiles.account_country),
  is_verified = coalesce(excluded.is_verified, profiles.is_verified),
  is_private = excluded.is_private,
  profile_picture_url = coalesce(excluded.profile_picture_url, profiles.profile_picture_url),
  tracked = profiles.tracked or excluded.tracked,
  lookup_count = profiles.lookup_count + excluded.lookup_count,
  last_lookup_at = coalesce(excluded.last_lookup_at, profiles.last_lookup_at),
  last_snapshot_at = excluded.last_snapshot_at,
  bio = coalesce(excluded.bio, profiles.bio),
  instagram_id = coalesce(excluded.instagram_id, profiles.instagram_id),
  updated_at = now()
returning id`;

const UPSERT_SNAPSHOT = `
insert into profile_snapshots (
  profile_id, captured_on, followers, following, posts_count, engagement_rate,
  avg_likes, avg_comments, avg_views, visible_posts, source
) values ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11)
on conflict (profile_id, captured_on) do update set
  captured_at = now(),
  followers = excluded.followers,
  following = excluded.following,
  posts_count = excluded.posts_count,
  engagement_rate = excluded.engagement_rate,
  avg_likes = excluded.avg_likes,
  avg_comments = excluded.avg_comments,
  avg_views = excluded.avg_views,
  visible_posts = excluded.visible_posts,
  source = excluded.source,
  updated_at = now()`;

// One statement for all posts: rows travel as a JSON array, so a lookup costs
// three database round trips however many posts are visible.
const UPSERT_POSTS = `
with input as (
  select * from jsonb_to_recordset($2::jsonb) as item(
    instagram_id text, type text, posted_at timestamptz, permalink text, caption text,
    hashtags text[], location text, likes bigint, comments bigint, views bigint
  )
), upserted as (
  insert into posts (profile_id, instagram_id, type, posted_at, permalink, caption, hashtags, location)
  select $1, instagram_id, type, posted_at, permalink, coalesce(caption, ''), coalesce(hashtags, '{}'), location
  from input
  on conflict (instagram_id) do update set
    type = excluded.type,
    posted_at = coalesce(excluded.posted_at, posts.posted_at),
    permalink = coalesce(excluded.permalink, posts.permalink),
    caption = excluded.caption,
    hashtags = excluded.hashtags,
    location = coalesce(excluded.location, posts.location),
    updated_at = now()
  returning id, instagram_id
)
insert into post_snapshots (post_id, captured_on, likes, comments, views)
select upserted.id, $3::date, input.likes, input.comments, input.views
from upserted join input using (instagram_id)
on conflict (post_id, captured_on) do update set
  captured_at = now(),
  likes = excluded.likes,
  comments = excluded.comments,
  views = excluded.views,
  updated_at = now()`;

// Stores today's snapshot. Never throws: history is a bonus and must not break
// a page or a collector run. Returns true when the snapshot was written.
export async function recordProfileSnapshot(
  profile: CreatorProfile,
  options: RecordOptions = {},
): Promise<boolean> {
  const sql = getSql();
  if (!sql || profile.source === "demo") {
    return false;
  }

  const now = options.now ?? new Date();
  const day = utcDay(now);
  const username = profile.username.trim().replace(/^@/, "").toLowerCase();

  try {
    const [row] = await sql(UPSERT_PROFILE, [
      username,
      profile.displayName || null,
      profile.category || null,
      profile.accountCountry ?? null,
      profile.verificationUnknown ? null : profile.isVerified,
      profile.isPrivate ?? false,
      profile.profilePictureUrl ?? null,
      options.tracked ?? false,
      options.lookup ? 1 : 0,
      options.lookup ? now.toISOString() : null,
      now.toISOString(),
      storableBio(profile.bio),
      storableInstagramId(profile.instagramId),
    ]);
    const profileId = row?.id;
    if (typeof profileId !== "string") {
      throw new Error("profile upsert returned no id");
    }

    const values = snapshotValues(profile);
    await sql(UPSERT_SNAPSHOT, [
      profileId,
      day,
      values.followers,
      values.following,
      values.postsCount,
      values.engagementRate,
      values.avgLikes,
      values.avgComments,
      values.avgViews,
      values.visiblePosts,
      profile.source,
    ]);

    if (profile.recentPosts.length > 0) {
      const items = profile.recentPosts.map((post) => ({
        instagram_id: postKey(post),
        type: post.type,
        posted_at: Number.isFinite(Date.parse(post.postedAt)) ? post.postedAt : null,
        permalink: post.permalink ?? null,
        caption: post.caption,
        hashtags: post.hashtags,
        location: post.location ?? null,
        likes: post.likesHidden ? null : post.likes,
        comments: post.comments,
        views: typeof post.viewCount === "number" ? post.viewCount : null,
      }));
      await sql(UPSERT_POSTS, [profileId, JSON.stringify(items), day]);
    }

    log.info("profile snapshot stored", { handle: username, posts: profile.recentPosts.length });
    return true;
  } catch (error) {
    log.warn("profile snapshot failed", {
      handle: username,
      message: error instanceof Error ? error.message : "unknown",
    });
    return false;
  }
}

const SELECT_HISTORY = `
select
  s.captured_on::text as date,
  s.followers,
  s.engagement_rate,
  (select min(first.captured_on) from profile_snapshots first where first.profile_id = p.id)::text as since
from profiles p
join profile_snapshots s on s.profile_id = p.id
where p.username = $1 and s.captured_on >= current_date - $2::int
order by s.captured_on asc`;

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// Reads the stored daily history. Returns null when there is none or the
// database is unavailable, so the page simply shows what it showed before.
export async function loadTrackingHistory(username: string): Promise<TrackingHistory | null> {
  const sql = getSql();
  if (!sql) {
    return null;
  }

  const key = username.trim().replace(/^@/, "").toLowerCase();
  try {
    const rows = await sql(SELECT_HISTORY, [key, HISTORY_DAYS]);
    const points: DailyPoint[] = [];
    for (const row of rows) {
      const followers = toNumber(row.followers);
      if (typeof row.date === "string" && followers !== null) {
        points.push({ date: row.date, followers, engagementRate: toNumber(row.engagement_rate) });
      }
    }
    if (points.length === 0) {
      return null;
    }
    const since = typeof rows[0]?.since === "string" ? (rows[0].since as string) : points[0].date;
    return { since, points };
  } catch (error) {
    log.warn("tracking history read failed", {
      handle: key,
      message: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

const MARK_TRACKED = `
insert into profiles (username, tracked)
select handle, true from unnest($1::text[]) as handle
on conflict (username) do update set tracked = true, updated_at = now()`;

// Handles due for the daily collector: tracked profiles plus anything a visitor
// looked up in the last 30 days, oldest snapshot first, skipping today's.
const SELECT_DUE = `
select username from profiles
where (tracked or last_lookup_at >= now() - interval '30 days')
  and (last_snapshot_at is null or last_snapshot_at < $1::date)
order by last_snapshot_at asc nulls first, lookup_count desc
limit $2`;

export async function markTracked(handles: readonly string[]): Promise<void> {
  const sql = getSql();
  const clean = [...new Set(handles.map((handle) => handle.trim().replace(/^@/, "").toLowerCase()))]
    .filter((handle) => /^[a-z0-9._]{1,30}$/.test(handle));
  if (!sql || clean.length === 0) {
    return;
  }
  await sql(MARK_TRACKED, [clean]);
}

export async function listDueHandles(limit: number, now = new Date()): Promise<string[]> {
  const sql = getSql();
  if (!sql) {
    return [];
  }
  const rows = await sql(SELECT_DUE, [utcDay(now), limit]);
  return rows
    .map((row) => row.username)
    .filter((value): value is string => typeof value === "string");
}
