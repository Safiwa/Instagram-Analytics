import type { HistoryPost } from "../data/postHistory";

export type EstimatedPoint = { date: string; followers: number };

const DAY_MS = 86_400_000;
const WEEKS = 52;

// An estimated weekly follower line for the year before measured tracking
// began, so 90D and 1Y have a shape on day one, as common analytics tools do.
// It is labelled as an estimate everywhere it appears.
//
// Method: the account's modeled 12-month growth sets how many followers it
// gained over the year (anchored to the first measured value, or today's
// count). That gain is spread across the weeks in proportion to the
// interactions its real posts earned in each week, with a small base so quiet
// weeks still move. Nothing here is a measured past count.
export function estimateFollowerHistory({
  anchorFollowers,
  anchorDate,
  growthPct12m,
  posts,
}: {
  anchorFollowers: number;
  anchorDate: string; // YYYY-MM-DD, first measured day (or today)
  growthPct12m: number | null;
  posts: readonly HistoryPost[];
}): EstimatedPoint[] {
  if (anchorFollowers <= 0 || growthPct12m === null || !Number.isFinite(growthPct12m)) {
    return [];
  }
  const growth = Math.min(Math.max(growthPct12m, -50), 300) / 100;
  const startFollowers = anchorFollowers / (1 + growth);
  const delta = anchorFollowers - startFollowers;
  const anchor = Date.parse(`${anchorDate}T00:00:00Z`);
  const start = anchor - WEEKS * 7 * DAY_MS;

  const weights = new Array<number>(WEEKS).fill(0);
  for (const post of posts) {
    const index = Math.floor((Date.parse(post.postedAt) - start) / (7 * DAY_MS));
    if (index >= 0 && index < WEEKS) {
      weights[index] += (post.likes ?? 0) + post.comments;
    }
  }
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const base = total > 0 ? (total / WEEKS) * 0.25 : 1;
  const adjusted = weights.map((weight) => weight + base);
  const adjustedTotal = adjusted.reduce((sum, weight) => sum + weight, 0);

  const points: EstimatedPoint[] = [];
  let followers = startFollowers;
  for (let week = 0; week < WEEKS; week += 1) {
    points.push({
      date: new Date(start + week * 7 * DAY_MS).toISOString().slice(0, 10),
      followers: Math.round(followers),
    });
    followers += (delta * adjusted[week]) / adjustedTotal;
  }
  return points;
}
