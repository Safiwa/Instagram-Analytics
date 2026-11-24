import type { CreatorProfile } from "../data/types";
import { engagementTrend, estimatePublicSignals, postsPerWeek } from "./estimates";

export type GrowthMomentum = "accelerating" | "steady" | "cooling" | "unknown";

export type GrowthAnalysis = {
  monthGrowthPct: number | null;
  monthGrowthFollowers: number | null;
  engagementTrendPct: number | null;
  postsPerWeek: number | null;
  // Counts only Reels among the publicly exposed recent posts. Public sources
  // expose at most 12 posts, so this is a minimum when the window is full.
  reelsLast30Days: number;
  postsInWindowCapped: boolean;
  momentum: GrowthMomentum;
  growthEstimated: boolean;
  basis: string;
};

const VISIBLE_POST_LIMIT = 12;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundSignificant(value: number, digits: number): number {
  if (value === 0 || !Number.isFinite(value)) {
    return 0;
  }
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(value))) - digits + 1);
  return Math.round(value / magnitude) * magnitude;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function analyzeGrowth(profile: CreatorProfile, now = new Date()): GrowthAnalysis {
  const posts = profile.recentPosts;
  const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const inWindow = posts.filter((post) => {
    const posted = Date.parse(post.postedAt);
    return Number.isFinite(posted) && posted >= cutoff;
  });
  const reelsLast30Days = inWindow.filter((post) => post.type === "Reel").length;
  const postsInWindowCapped =
    posts.length >= VISIBLE_POST_LIMIT && inWindow.length === posts.length;

  const unavailable: GrowthAnalysis = {
    monthGrowthPct: null,
    monthGrowthFollowers: null,
    engagementTrendPct: null,
    postsPerWeek: null,
    reelsLast30Days,
    postsInWindowCapped,
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
      // One twelfth of the modeled 12-month change keeps both estimates
      // consistent. The interaction trend drives the momentum label instead
      // of adding a separate monthly swing the yearly figure never shows.
      monthGrowthPct = round2(clamp(annual / 12, -8, 12));
    }
  }

  const momentum: GrowthMomentum =
    trend === null ? "unknown" : trend > 8 ? "accelerating" : trend < -8 ? "cooling" : "steady";

  if (monthGrowthFollowers === null && monthGrowthPct !== null) {
    // A modeled change is shown to two significant figures so it does not
    // read like an exact follower count.
    monthGrowthFollowers = roundSignificant((profile.followers * monthGrowthPct) / 100, 2);
  }

  return {
    monthGrowthPct,
    monthGrowthFollowers,
    engagementTrendPct: trend === null ? null : round2(trend),
    postsPerWeek: cadence === null ? null : round2(cadence),
    reelsLast30Days,
    postsInWindowCapped,
    momentum,
    growthEstimated,
    basis:
      (growthEstimated
        ? "30-day follower change is modeled from the same public signals as 12-month growth. Interaction trend and posting cadence are measured from recent public posts."
        : "30-day follower change uses the most recent two monthly data points. Interaction trend and posting cadence are measured from recent public posts.") +
      (postsInWindowCapped
        ? " Public views expose only 12 recent posts, so the 30-day reel count is a minimum."
        : ""),
  };
}
