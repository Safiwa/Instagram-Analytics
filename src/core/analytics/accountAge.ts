import type { CreatorProfile } from "../data/types";

// Instagram publishes no join date outside the logged-in app's "About this
// account" sheet, and numeric account ids are not issued in date order (a
// November 2026 account carried an id typical of 2021), so ids are not used.
//
// What can be measured is the first public post: when every post the account
// has published is visible to this site, the oldest one is the account's first
// post. Larger accounts show only their latest posts, so their first post is
// unknown and this criterion is simply left out for them.
export type FirstPost = { year: number; month: number; label: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function firstPublicPost(profile: CreatorProfile): FirstPost | null {
  const posts = profile.recentPosts;
  if (profile.postsCount <= 0 || posts.length < profile.postsCount) {
    return null;
  }
  const times = posts
    .map((post) => Date.parse(post.postedAt))
    .filter((time) => Number.isFinite(time));
  if (times.length === 0) {
    return null;
  }
  const first = new Date(Math.min(...times));
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth();
  return { year, month, label: `First post ${MONTHS[month]} ${year}` };
}

// 100 for the same month, minus 4 points per month apart (0 after ~2 years).
// Null when either side's first post is unknown, so callers leave it out.
export function joinDateSimilarity(left: CreatorProfile, right: CreatorProfile): number | null {
  const a = firstPublicPost(left);
  const b = firstPublicPost(right);
  if (!a || !b) {
    return null;
  }
  const months = Math.abs((a.year - b.year) * 12 + (a.month - b.month));
  return Math.max(0, 100 - months * 4);
}

export function joinedLabel(profile: CreatorProfile): string | null {
  return firstPublicPost(profile)?.label ?? null;
}
