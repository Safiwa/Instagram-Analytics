import type { CreatorProfile } from "../data/types";
import { engagementTrend, estimatePublicSignals, postsPerWeek } from "./estimates";

export type GrowthMomentum = "accelerating" | "steady" | "cooling" | "unknown";

export type GrowthAnalysis = {
  monthGrowthPct: number | null;
  monthGrowthFollowers: number | null;
  engagementTrendPct: number | null;
  postsPerWeek: number | null;
  postsLast30Days: number;
  momentum: GrowthMomentum;
  growthEstimated: boolean;
  basis: string;
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function analyzeGrowth(profile: CreatorProfile, now = new Date()): GrowthAnalysis {
  const posts = profile.recentPosts;
  const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const postsLast30Days = posts.filter((post) => {
    const posted = Date.parse(post.postedAt);
    return Number.isFinite(posted) && posted >= cutoff;
  }).length;

  const unavailable: GrowthAnalysis = {
    monthGrowthPct: null,
    monthGrowthFollowers: null,
    engagementTrendPct: null,
    postsPerWeek: null,
    postsLast30Days,
    momentum: "unknown",
    growthEstimated: false,
    basis: "Not enough public post data for a 30-day analysis.",
  };

  if (profile.isPrivate || profile.followers <= 0 || posts.length === 0) {
    return unavailable;
  }

  const trend = engagementTrend(posts);
  const cadence = postsPerWeek(posts);
  const history = profile.followerHistory;

  let monthGrowthPct: number | null = null;
  let monthGrowthFollowers: number | null = null;
  let growthEstimated = false;
  if (history.length >= 2) {
    const previous = history[history.length - 2].followers;
    const current = history[history.length - 1].followers;
    if (previous > 0) {
      monthGrowthPct = round2(((current - previous) / previous) * 100);
      monthGrowthFollowers = current - previous;
    }
  } else if (profile.source !== "demo") {
    const annual = estimatePublicSignals(profile).followerGrowthPct;
    if (annual !== null) {
      growthEstimated = true;
      monthGrowthPct = annual / 12;
      if (trend !== null) {
        monthGrowthPct += clamp(trend * 0.25, -3, 4);
      }
      monthGrowthPct = round2(clamp(monthGrowthPct, -8, 12));
    }
  }

  const momentum: GrowthMomentum =
    trend === null ? "unknown" : trend > 8 ? "accelerating" : trend < -8 ? "cooling" : "steady";

  if (monthGrowthFollowers === null && monthGrowthPct !== null) {
    monthGrowthFollowers = Math.round((profile.followers * monthGrowthPct) / 100);
  }

  return {
    monthGrowthPct,
    monthGrowthFollowers,
    engagementTrendPct: trend === null ? null : round2(trend),
    postsPerWeek: cadence === null ? null : round2(cadence),
    postsLast30Days,
    momentum,
    growthEstimated,
    basis: growthEstimated
      ? "30-day follower change is modeled from the same public signals as 12-month growth. Interaction trend and posting cadence are measured from recent public posts."
      : "30-day follower change uses the most recent two monthly data points. Interaction trend and posting cadence are measured from recent public posts.",
  };
}
