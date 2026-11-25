import { randomInt } from "node:crypto";
import type { FollowerSample } from "../analytics/followerAudit";
import type { FollowerSignals } from "../data/public";
import { getSql } from "./client";

// Follower-list audit storage. Every function is scoped to one connected
// account; rows are removed with the account or replaced by a new upload.

// Largest number of followers checked per upload. Small accounts are checked
// in full (a census); larger ones get a random sample of this size.
export const FOLLOWER_SAMPLE_LIMIT = 300;
// A follower whose profile could not be read this many times is skipped.
export const MAX_CHECK_ATTEMPTS = 3;

const HANDLE = /^[a-z0-9._]{1,30}$/;
const RESERVED = new Set(["accounts", "explore", "p", "reel", "reels", "stories", "direct", "about", "_u"]);

function handleFromUrl(value: string): string | null {
  const match = value.match(/instagram\.com\/(?:_u\/)?([A-Za-z0-9._]{1,30})\/?(?:[?#]|$)/);
  const handle = match?.[1]?.toLowerCase();
  return handle && HANDLE.test(handle) && !RESERVED.has(handle) ? handle : null;
}

function collectFromJson(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectFromJson(item, out);
    }
    return;
  }
  if (!node || typeof node !== "object") {
    return;
  }
  const record = node as Record<string, unknown>;
  // Instagram export entries: { string_list_data: [{ href, value, timestamp }] }
  // (newer exports may put the handle in the entry's "title").
  if (Array.isArray(record.string_list_data)) {
    for (const entry of record.string_list_data as Record<string, unknown>[]) {
      const value = typeof entry?.value === "string" ? entry.value.trim().toLowerCase() : "";
      const fromValue = HANDLE.test(value) ? value : null;
      const fromHref = typeof entry?.href === "string" ? handleFromUrl(entry.href) : null;
      const fromTitle =
        typeof record.title === "string" && HANDLE.test(record.title.trim().toLowerCase())
          ? record.title.trim().toLowerCase()
          : null;
      const handle = fromValue ?? fromHref ?? fromTitle;
      if (handle) {
        out.add(handle);
      }
    }
    return;
  }
  for (const value of Object.values(record)) {
    collectFromJson(value, out);
  }
}

// Reads the followers file from Instagram's "Download your information"
// export (followers_1.json, or the HTML version). Returns unique handles.
export function parseFollowerExport(text: string): string[] {
  const handles = new Set<string>();
  const trimmed = text.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      collectFromJson(JSON.parse(trimmed), handles);
      return [...handles];
    } catch {
      // Not JSON after all: fall through to link scanning.
    }
  }
  for (const match of trimmed.matchAll(/https?:\/\/(?:www\.)?instagram\.com\/[^"'\s<>]+/g)) {
    const handle = handleFromUrl(match[0]);
    if (handle) {
      handles.add(handle);
    }
  }
  return [...handles];
}

// Unbiased random sample (partial Fisher-Yates with a CSPRNG).
export function randomSample<T>(items: readonly T[], size: number): T[] {
  const copy = [...items];
  const count = Math.min(size, copy.length);
  for (let i = 0; i < count; i += 1) {
    const j = i + randomInt(copy.length - i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

export async function saveFollowerUpload(accountId: string, handles: readonly string[]): Promise<number> {
  const sql = getSql();
  if (!sql) {
    throw new Error("DATABASE_URL is not configured.");
  }
  const sample = randomSample(handles, FOLLOWER_SAMPLE_LIMIT);
  await sql(`delete from follower_checks where connected_account_id = $1`, [accountId]);
  if (sample.length > 0) {
    await sql(
      `insert into follower_checks (connected_account_id, username)
       select $1, handle from unnest($2::text[]) as handle
       on conflict (connected_account_id, username) do nothing`,
      [accountId, sample],
    );
  }
  await sql(
    `update connected_accounts set followers_uploaded_at = now(), followers_in_upload = $2,
       updated_at = now() where id = $1`,
    [accountId, handles.length],
  );
  return sample.length;
}

export type PendingCheck = { id: string; username: string; attempts: number };

export async function listPendingChecks(limit: number, accountId?: string): Promise<PendingCheck[]> {
  const sql = getSql();
  if (!sql) {
    return [];
  }
  const rows = await sql(
    `select id, username, attempts from follower_checks
     where status = 'pending' and ($2::uuid is null or connected_account_id = $2)
     order by attempts asc, created_at asc
     limit $1`,
    [limit, accountId ?? null],
  );
  return rows.map((row) => ({
    id: String(row.id),
    username: String(row.username),
    attempts: Number(row.attempts) || 0,
  }));
}

export async function recordCheck(
  check: PendingCheck,
  result: FollowerSignals | "not_found" | null,
): Promise<void> {
  const sql = getSql();
  if (!sql) {
    return;
  }
  if (result === null) {
    await sql(
      `update follower_checks set attempts = attempts + 1,
         status = case when attempts + 1 >= $2 then 'unavailable' else 'pending' end,
         updated_at = now() where id = $1`,
      [check.id, MAX_CHECK_ATTEMPTS],
    );
    return;
  }
  if (result === "not_found") {
    await sql(
      `update follower_checks set status = 'unavailable', checked_at = now(), updated_at = now() where id = $1`,
      [check.id],
    );
    return;
  }
  await sql(
    `update follower_checks set status = 'checked', checked_at = now(), updated_at = now(),
       posts = $2, followers = $3, following = $4, has_profile_pic = $5, has_name = $6,
       has_bio = $7, is_private = $8
     where id = $1`,
    [
      check.id,
      result.posts ?? null,
      result.followers ?? null,
      result.following ?? null,
      result.hasProfilePic ?? null,
      result.hasName ?? null,
      result.hasBio ?? null,
      result.isPrivate ?? null,
    ],
  );
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

// Checked followers of a connected handle, in the shape the audit scores.
// Name and bio are only known as present/absent, which is all the
// "empty profile" rule needs.
export async function loadFollowerSample(username: string): Promise<FollowerSample[] | null> {
  const sql = getSql();
  if (!sql) {
    return null;
  }
  const rows = await sql(
    `select f.username, f.posts, f.followers, f.following, f.has_profile_pic, f.has_name,
            f.has_bio, f.is_private
     from follower_checks f
     join connected_accounts c on c.id = f.connected_account_id
     where c.username = $1 and f.status = 'checked'`,
    [username.trim().replace(/^@/, "").toLowerCase()],
  );
  if (rows.length === 0) {
    return null;
  }
  return rows.map((row) => {
    const hasName = optionalBoolean(row.has_name);
    const hasBio = optionalBoolean(row.has_bio);
    return {
      username: String(row.username),
      posts: optionalNumber(row.posts),
      followers: optionalNumber(row.followers),
      following: optionalNumber(row.following),
      hasProfilePic: optionalBoolean(row.has_profile_pic),
      fullName: hasName === undefined ? undefined : hasName ? "present" : "",
      bio: hasBio === undefined ? undefined : hasBio ? "present" : "",
      isPrivate: optionalBoolean(row.is_private),
    };
  });
}

export type FollowerUploadStatus = {
  uploadedAt: string | null;
  inUpload: number;
  sampled: number;
  checked: number;
  pending: number;
  unavailable: number;
};

export async function followerUploadStatus(accountId: string): Promise<FollowerUploadStatus | null> {
  const sql = getSql();
  if (!sql) {
    return null;
  }
  const rows = await sql(
    `select c.followers_uploaded_at, c.followers_in_upload,
       count(f.id)::int as sampled,
       count(f.id) filter (where f.status = 'checked')::int as checked,
       count(f.id) filter (where f.status = 'pending')::int as pending,
       count(f.id) filter (where f.status = 'unavailable')::int as unavailable
     from connected_accounts c
     left join follower_checks f on f.connected_account_id = c.id
     where c.id = $1
     group by c.id`,
    [accountId],
  );
  const row = rows[0];
  if (!row) {
    return null;
  }
  const uploadedAt = row.followers_uploaded_at;
  return {
    uploadedAt:
      uploadedAt instanceof Date ? uploadedAt.toISOString() : typeof uploadedAt === "string" ? uploadedAt : null,
    inUpload: Number(row.followers_in_upload) || 0,
    sampled: Number(row.sampled) || 0,
    checked: Number(row.checked) || 0,
    pending: Number(row.pending) || 0,
    unavailable: Number(row.unavailable) || 0,
  };
}
