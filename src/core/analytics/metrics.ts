import type { CreatorProfile } from "../data/types";
import { estimatePublicSignals } from "./estimates";

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function computeMetrics(profile: CreatorProfile) {
  const posts = profile.recentPosts;
  const avgLikes = round2(average(posts.map((post) => post.likes)));
  const avgComments = round2(average(posts.map((post) => post.comments)));
  const savesComplete = posts.length > 0 && posts.every((post) => typeof post.saves === "number");
  const avgSaves = savesComplete ? round2(average(posts.map((post) => post.saves ?? 0))) : null;
  const engagementBasis = avgSaves === null ? "likes+comments" : "likes+comments+saves";

  const engagementRate =
    profile.followers === 0
      ? 0
      : round2(((avgLikes + avgComments + (avgSaves ?? 0)) / profile.followers) * 100);

  // Demo fixtures keep their exact values. Public/live profiles have no measured
  // fake-follower or history fields, so they may use disclosed public-signal estimates.
  const estimates = profile.source === "demo" ? null : estimatePublicSignals(profile);

  const history = profile.followerHistory;
  const first = history.length > 0 ? history[0].followers : 0;
  const last = history.length > 0 ? history[history.length - 1].followers : 0;
  const measuredGrowthPct =
    history.length >= 2 && first !== 0 ? round2(((last - first) / first) * 100) : null;
  const growthEstimate = estimates?.followerGrowthPct ?? null;
  const followerGrowthPct = measuredGrowthPct ?? growthEstimate;
  const growthEstimated = measuredGrowthPct === null && typeof growthEstimate === "number";

  const measuredAuthenticityPct =
    typeof profile.fakeFollowers === "number" && profile.followers > 0
      ? round2((1 - profile.fakeFollowers / profile.followers) * 100)
      : null;
  const authenticityEstimate = estimates?.authenticityPct ?? null;
  const authenticityPct = measuredAuthenticityPct ?? authenticityEstimate;
  const authenticityEstimated =
    measuredAuthenticityPct === null && typeof authenticityEstimate === "number";

  const fakeFollowers =
    typeof profile.fakeFollowers === "number" && profile.followers > 0
      ? profile.fakeFollowers
      : (estimates?.fakeFollowers ?? null);
  const fakeFollowersPct =
    measuredAuthenticityPct !== null
      ? round2(100 - measuredAuthenticityPct)
      : (estimates?.fakeFollowersPct ?? null);

  const usingEstimates = growthEstimated || authenticityEstimated;

  return {
    avgLikes,
    avgComments,
    avgSaves,
    engagementRate,
    engagementBasis,
    fakeFollowers,
    fakeFollowersPct,
    followerGrowthPct,
    authenticityPct,
    growthEstimated,
    authenticityEstimated,
    estimateConfidence: usingEstimates ? (estimates?.confidence ?? null) : null,
    estimateSignals: usingEstimates ? (estimates?.signals ?? []) : [],
    estimateMethodology: usingEstimates ? (estimates?.methodology ?? null) : null,
  };
}

export type ProfileMetrics = ReturnType<typeof computeMetrics>;
