import { fetchPostHistory, type HistoryPost } from "../data/postHistory";
import { log } from "../logging/logger";
import { getSql } from "./client";

export type StoredPostHistory = { fetchedAt: string; posts: HistoryPost[] };

const REFRESH_MS = 24 * 60 * 60 * 1000;

async function loadStored(username: string): Promise<StoredPostHistory | null> {
  const sql = getSql();
  if (!sql) {
    return null;
  }
  const rows = await sql("select fetched_at, posts from post_history where username = $1", [username]);
  const row = rows[0];
  if (!row) {
    return null;
  }
  const raw = typeof row.posts === "string" ? JSON.parse(row.posts) : row.posts;
  return {
    fetchedAt: new Date(row.fetched_at as string).toISOString(),
    posts: Array.isArray(raw) ? (raw as HistoryPost[]) : [],
  };
}

async function store(username: string, posts: HistoryPost[], fetchedAt: string): Promise<void> {
  const sql = getSql();
  if (!sql) {
    return;
  }
  await sql(
    `insert into post_history (username, fetched_at, posts) values ($1, $2::timestamptz, $3::jsonb)
     on conflict (username) do update set fetched_at = excluded.fetched_at, posts = excluded.posts`,
    [username, fetchedAt, JSON.stringify(posts)],
  );
}

// A year of post metrics for the profile page: the stored copy when it is less
// than a day old, otherwise a fresh Business Discovery read (saved for the next
// visitor). Falls back to the stored copy, then null, when Instagram refuses.
export async function getPostHistory(
  username: string,
  options: { fetcher?: typeof fetchPostHistory; now?: number } = {},
): Promise<StoredPostHistory | null> {
  const key = username.toLowerCase();
  const now = options.now ?? Date.now();
  const fetcher = options.fetcher ?? fetchPostHistory;
  const stored = await loadStored(key).catch(() => null);
  if (stored && now - Date.parse(stored.fetchedAt) < REFRESH_MS) {
    return stored;
  }
  const fresh = await fetcher(key, { now });
  if (!fresh) {
    return stored;
  }
  await store(key, fresh, new Date(now).toISOString()).catch((error) =>
    log.warn("post history store failed", {
      username: key,
      message: error instanceof Error ? error.message : "unknown",
    }),
  );
  return { fetchedAt: new Date(now).toISOString(), posts: fresh };
}
