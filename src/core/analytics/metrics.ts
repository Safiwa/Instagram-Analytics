import type { CreatorProfile } from "../data/types";
import { estimatePublicSignals, FAKE_FOLLOWER_RISK_LABEL, fakeFollowerRisk } from "./estimates";
import { auditFollowers } from "./followerAudit";
import { median, postsWithVisibleLikes } from "./posts";

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
  // A stored snapshot fills only the three engagement cards when Instagram
  // exposes no posts. It must not become a fake post or feed public-signal models.
  const storedEngagement =
    profile.source !== "demo" &&
    !profile.isPrivate &&
    profile.followers > 0 &&
    posts.length === 0
      ? (profile.storedEngagement ?? null)
      : null;
  // Posts with hidden like counts report 0 likes. Averaging those zeros would
  // understate likes and engagement, so likes use only posts that show them.
  const visibleLikePosts = postsWithVisibleLikes(posts);
  const hiddenLikePosts = posts.length - visibleLikePosts.length;
  const postAvgLikes = round2(average(visibleLikePosts.map((post) => post.likes)));
  const postAvgComments = round2(average(posts.map((post) => post.comments)));
  const avgLikes = storedEngagement ? storedEngagement.averageLikes : postAvgLikes;
  const avgComments = storedEngagement ? storedEngagement.averageComments : postAvgComments;
  const savesComplete = posts.length > 0 && posts.every((post) => typeof post.saves === "number");
  const avgSaves = savesComplete ? round2(average(posts.map((post) => post.saves ?? 0))) : null;
  const engagementBasis = storedEngagement
    ? "stored:likes+comments"
    : avgSaves === null
      ? "likes+comments"
      : "likes+comments+saves";
  const engagementSource = storedEngagement
    ? "stored-snapshot"
    : posts.length > 0
      ? "public-posts"
      : "unavailable";

  const engagementRate = storedEngagement
    ? round2(storedEngagement.engagementRatePct)
    : profile.followers === 0
      ? 0
      : round2(((avgLikes + avgComments + (avgSaves ?? 0)) / profile.followers) * 100);

  // The average is pulled up by a single viral post. The typical (median) post
  // shows what a normal upload earns; both are reported side by side.
  const typicalEngagementRate =
    storedEngagement || visibleLikePosts.length === 0 || profile.followers === 0
      ? null
      : round2(
          (median(visibleLikePosts.map((post) => post.likes + post.comments)) /
            profile.followers) *
            100,
        );

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
  // A follower-sample audit, when available, replaces the profile-level model:
  // it checks real follower accounts instead of inferring from engagement.
  const followerAudit =
    profile.source !== "demo" && profile.followerSample
      ? auditFollowers(profile.followerSample, profile.followers)
      : null;
  const authenticityEstimate = followerAudit
    ? round2(100 - followerAudit.fakeSharePct)
    : (estimates?.authenticityPct ?? null);
  const authenticityPct = measuredAuthenticityPct ?? authenticityEstimate;
  // A census audit counts every follower, so it is a measurement, not an estimate.
  const authenticityEstimated =
    measuredAuthenticityPct === null &&
    typeof authenticityEstimate === "number" &&
    !followerAudit?.census;

  const fakeFollowers =
    typeof profile.fakeFollowers === "number" && profile.followers > 0
      ? profile.fakeFollowers
      : followerAudit
        ? followerAudit.estimatedFakeFollowers
        : (estimates?.fakeFollowers ?? null);
  const fakeFollowersPct =
    measuredAuthenticityPct !== null
      ? round2(100 - measuredAuthenticityPct)
      : followerAudit
        ? followerAudit.fakeSharePct
        : (estimates?.fakeFollowersPct ?? null);
  const fakeFollowerSource: "measured" | "follower-audit" | "modeled" | null =
    measuredAuthenticityPct !== null
      ? "measured"
      : followerAudit
        ? "follower-audit"
        : fakeFollowersPct !== null
          ? "modeled"
          : null;

  const usingEstimates = growthEstimated || authenticityEstimated;
  const fakeFollowersRange =
    measuredAuthenticityPct !== null
      ? null
      : followerAudit
        ? { lowPct: followerAudit.lowPct, highPct: followerAudit.highPct }
        : estimates?.fakeFollowersLowPct != null && estimates.fakeFollowersHighPct != null
          ? { lowPct: estimates.fakeFollowersLowPct, highPct: estimates.fakeFollowersHighPct }
          : null;

  return {
    avgLikes,
    avgComments,
    avgSaves,
    engagementRate,
    typicalEngagementRate,
    hiddenLikePosts,
    engagementBasis,
    engagementSource,
    storedEngagement,
    fakeFollowers,
    fakeFollowersPct,
    fakeFollowersRange,
    fakeFollowerRisk:
      measuredAuthenticityPct !== null
        ? null
        : followerAudit
          ? fakeFollowerRisk(followerAudit.fakeSharePct)
          : (estimates?.fakeFollowerRisk ?? null),
    fakeFollowerSource,
    followerAudit,
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

// Modeled fake followers are shown as a share range plus a risk band, never as
// an exact count: the model cannot see the follower list. Measured (demo)
// values keep their exact count.
export function describeFakeFollowers(metrics: ProfileMetrics, fallback = "—"): string {
  if (metrics.followerAudit?.census) {
    const audit = metrics.followerAudit;
    return `${Math.round(audit.fakeSharePct)}% (${audit.fakeCount.toLocaleString("en-US")} of ${audit.sampleSize.toLocaleString("en-US")} flagged)`;
  }
  if (metrics.fakeFollowersRange && metrics.fakeFollowerRisk) {
    const { lowPct, highPct } = metrics.fakeFollowersRange;
    return `${Math.round(lowPct)}-${Math.round(highPct)}% (${FAKE_FOLLOWER_RISK_LABEL[metrics.fakeFollowerRisk]})`;
  }
  return typeof metrics.fakeFollowers === "number"
    ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
        metrics.fakeFollowers,
      )
    : fallback;
}
