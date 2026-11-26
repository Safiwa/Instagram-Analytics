import type { HistoryPost } from "../data/postHistory";

export const POST_RANGES = [
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "1Y", days: 365 },
] as const;

export type PostBucket = {
  start: string; // ISO date (UTC) the bucket starts on
  posts: number;
  avgLikes: number | null; // null when every post in the bucket hides likes
  avgComments: number;
  avgViews: number | null; // null when no post in the bucket reports views
};

export type PostPerformance = {
  days: number;
  bucket: "week" | "month";
  buckets: PostBucket[];
  posts: number;
  avgLikes: number | null;
  avgComments: number;
  avgViews: number | null;
  // Average (likes + comments) per post as a share of current followers.
  engagementRate: number | null;
  postsPerWeek: number;
  // The oldest post read; when it is newer than the range start and the read
  // hit its cap, older posts in the range were not read.
  oldestPost: string | null;
};

const DAY_MS = 86_400_000;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : round2(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function bucketStart(time: number, bucket: "week" | "month"): number {
  const date = new Date(time);
  if (bucket === "month") {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  }
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const weekday = (date.getUTCDay() + 6) % 7; // Monday = 0
  return day - weekday * DAY_MS;
}

function summarize(posts: HistoryPost[]) {
  const liked = posts.filter((post) => post.likes !== null).map((post) => post.likes as number);
  const viewed = posts.filter((post) => post.views !== null).map((post) => post.views as number);
  return {
    avgLikes: average(liked),
    avgComments: average(posts.map((post) => post.comments)) ?? 0,
    avgViews: average(viewed),
  };
}

// Measured post metrics over a range, grouped by week (30D, 90D) or month (1Y).
// Every figure is Instagram's current count for real posts; nothing is modeled.
export function buildPostPerformance(
  history: readonly HistoryPost[],
  days: number,
  followers: number,
  now = Date.now(),
): PostPerformance {
  const start = now - days * DAY_MS;
  const inRange = history
    .filter((post) => {
      const time = Date.parse(post.postedAt);
      return time >= start && time <= now;
    })
    .sort((left, right) => Date.parse(left.postedAt) - Date.parse(right.postedAt));
  const bucket = days > 120 ? "month" : "week";

  const groups = new Map<number, HistoryPost[]>();
  for (let time = bucketStart(start, bucket); time <= now; ) {
    groups.set(time, []);
    if (bucket === "month") {
      const date = new Date(time);
      time = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
    } else {
      time += 7 * DAY_MS;
    }
  }
  for (const post of inRange) {
    groups.get(bucketStart(Date.parse(post.postedAt), bucket))?.push(post);
  }

  const buckets: PostBucket[] = [...groups.entries()].map(([time, posts]) => ({
    start: new Date(time).toISOString().slice(0, 10),
    posts: posts.length,
    ...summarize(posts),
  }));

  const totals = summarize(inRange);
  const interactions = inRange.map((post) => (post.likes ?? 0) + post.comments);
  const avgInteractions = average(interactions);
  const oldest = history.reduce<string | null>(
    (min, post) => (min === null || post.postedAt < min ? post.postedAt : min),
    null,
  );

  return {
    days,
    bucket,
    buckets,
    posts: inRange.length,
    ...totals,
    engagementRate:
      avgInteractions !== null && followers > 0 ? round2((avgInteractions / followers) * 100) : null,
    postsPerWeek: round2(inRange.length / (days / 7)),
    oldestPost: oldest,
  };
}
