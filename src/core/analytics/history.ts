import type { CreatorProfile, DailyPoint } from "../data/types";

const DAY_MS = 24 * 60 * 60 * 1000;
// A baseline must be at least 30 days old. Up to 45 days is accepted so a few
// missed collector runs do not hide a measured change.
export const MEASURED_WINDOW_MIN_DAYS = 30;
export const MEASURED_WINDOW_MAX_DAYS = 45;

export type MeasuredChange = {
  baselineDate: string;
  days: number;
  followers: number;
  pct: number;
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function dayStart(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

// Follower change measured against this site's own stored snapshot from 30-45
// days ago. Returns null until such a snapshot exists, so callers keep their
// disclosed estimate until real history is available.
export function measuredMonthChange(
  profile: CreatorProfile,
  now = new Date(),
): MeasuredChange | null {
  const points = profile.tracking?.points ?? [];
  if (profile.source === "demo" || profile.followers <= 0 || points.length === 0) {
    return null;
  }

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let baseline: DailyPoint | null = null;
  for (const point of points) {
    const age = Math.round((today - dayStart(point.date)) / DAY_MS);
    if (age >= MEASURED_WINDOW_MIN_DAYS && age <= MEASURED_WINDOW_MAX_DAYS && point.followers > 0) {
      // Points are ascending, so the last match is the most recent baseline.
      baseline = point;
    }
  }
  if (!baseline) {
    return null;
  }

  const followers = profile.followers - baseline.followers;
  return {
    baselineDate: baseline.date,
    days: Math.round((today - dayStart(baseline.date)) / DAY_MS),
    followers,
    pct: round2((followers / baseline.followers) * 100),
  };
}
