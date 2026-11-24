import type { CreatorProfile, Post } from "../data/types";
import { postsWithVisibleLikes, quartileDispersion } from "./posts";

export type EstimateImpact = "positive" | "neutral" | "negative";
export type EstimateConfidence = "low" | "medium" | "high";

export const ESTIMATE_CONFIDENCE_LABEL: Record<EstimateConfidence, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export type EstimateSignal = {
  label: string;
  value: string;
  impact: EstimateImpact;
};

export type FakeFollowerRisk = "low" | "medium" | "high";

export const FAKE_FOLLOWER_RISK_LABEL: Record<FakeFollowerRisk, string> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk",
};

export type PublicEstimates = {
  fakeFollowers: number | null;
  fakeFollowersPct: number | null;
  // The model is a heuristic, so the share is reported as a band around the
  // point estimate. Its width follows the confidence level.
  fakeFollowersLowPct: number | null;
  fakeFollowersHighPct: number | null;
  fakeFollowerRisk: FakeFollowerRisk | null;
  authenticityPct: number | null;
  followerGrowthPct: number | null;
  confidence: EstimateConfidence | null;
  signals: EstimateSignal[];
  methodology: string | null;
};

const METHODOLOGY =
  "Modeled from public signals: follower/following balance, engagement versus size benchmarks, comment-to-like ratio, engagement stability, posting cadence, verification, and public reach where available. Posts whose like counts are hidden are left out of every like-based signal, and engagement stability uses the middle half of posts so one viral post cannot skew it. Instagram does not publish fake-follower counts or historical follower data, so these are estimates, not measurements, and are shown as a range.";

// Typical (median) post engagement as a share of an account's mean engagement.
const TYPICAL_POST_SHARE = 0.6;

const RANGE_HALF_WIDTH: Record<EstimateConfidence, number> = { high: 5, medium: 8, low: 12 };

export function fakeFollowerRisk(fakePct: number): FakeFollowerRisk {
  return fakePct < 12 ? "low" : fakePct < 25 ? "medium" : "high";
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function benchmarkEngagementRate(followers: number): number {
  if (followers < 5_000) {
    return 5.5;
  }
  if (followers < 20_000) {
    return 3.5;
  }
  if (followers < 100_000) {
    return 2.0;
  }
  if (followers < 500_000) {
    return 1.4;
  }
  if (followers < 1_000_000) {
    return 1.0;
  }
  return 0.8;
}

export function engagementTrend(posts: Post[]): number | null {
  const dated = postsWithVisibleLikes(posts)
    .map((post) => ({
      at: new Date(post.postedAt).getTime(),
      total: post.likes + post.comments,
    }))
    .filter((item) => Number.isFinite(item.at))
    .sort((left, right) => left.at - right.at);

  if (dated.length < 4) {
    return null;
  }

  const middle = Math.floor(dated.length / 2);
  const older = median(dated.slice(0, middle).map((item) => item.total));
  const recent = median(dated.slice(middle).map((item) => item.total));

  if (older <= 0) {
    return null;
  }

  return ((recent - older) / older) * 100;
}

export function postsPerWeek(posts: Post[]): number | null {
  const times = posts
    .map((post) => new Date(post.postedAt).getTime())
    .filter((time) => Number.isFinite(time))
    .sort((left, right) => left - right);

  if (times.length < 2) {
    return null;
  }

  const days = (times[times.length - 1] - times[0]) / (1000 * 60 * 60 * 24);
  if (days <= 0) {
    return null;
  }

  return (times.length - 1) / (days / 7);
}

function medianReachRatio(posts: Post[], followers: number): number | null {
  const views = posts
    .map((post) => post.viewCount)
    .filter((value): value is number => typeof value === "number" && value > 0);

  if (views.length === 0 || followers <= 0) {
    return null;
  }

  return median(views) / followers;
}

function emptyEstimates(): PublicEstimates {
  return {
    fakeFollowers: null,
    fakeFollowersPct: null,
    fakeFollowersLowPct: null,
    fakeFollowersHighPct: null,
    fakeFollowerRisk: null,
    authenticityPct: null,
    followerGrowthPct: null,
    confidence: null,
    signals: [],
    methodology: null,
  };
}

export function estimatePublicSignals(profile: CreatorProfile): PublicEstimates {
  const posts = profile.recentPosts;

  if (
    profile.isPrivate ||
    profile.followers <= 0 ||
    posts.length === 0
  ) {
    return emptyEstimates();
  }

  // Hidden like counts arrive as 0. Counting them as real zeros understates
  // engagement and fakes instability, so like-based signals use only posts
  // whose likes are visible. Comments stay visible on every post.
  const visible = postsWithVisibleLikes(posts);
  const hiddenLikePosts = posts.length - visible.length;
  const likesKnown = visible.length > 0;
  const avgLikes = average(visible.map((post) => post.likes));
  const avgComments = average(posts.map((post) => post.comments));
  const engagementRate = ((avgLikes + avgComments) / profile.followers) * 100;
  // The size check compares the typical (median) post, not the mean, so one
  // viral post cannot swing the estimate by tens of points. Published size
  // benchmarks are account means, and a typical post sits below the mean, so
  // the benchmark is scaled to a typical-post level.
  const typicalRate = likesKnown
    ? (median(visible.map((post) => post.likes + post.comments)) / profile.followers) * 100
    : 0;
  const benchmark = benchmarkEngagementRate(profile.followers) * TYPICAL_POST_SHARE;
  // Without any visible like count the size benchmark cannot be judged.
  const engagementRatio = likesKnown ? typicalRate / benchmark : 1;
  const followerRatio = profile.following / profile.followers;
  const commentRatio = (() => {
    const medianLikes = median(visible.map((post) => post.likes));
    if (medianLikes <= 0) {
      return null;
    }
    return (median(visible.map((post) => post.comments)) / medianLikes) * 100;
  })();
  // Quartile spread of typical posts, not a mean-based variation that a
  // single viral post dominates.
  const variability = quartileDispersion(visible.map((post) => post.likes + post.comments));
  const cadence = postsPerWeek(posts);
  const reachRatio = medianReachRatio(posts, profile.followers);
  const trend = engagementTrend(posts);

  let fakePct = 8;

  if (followerRatio > 1) {
    fakePct += 25;
  } else if (followerRatio > 0.5) {
    fakePct += 16;
  } else if (followerRatio > 0.25) {
    fakePct += 9;
  } else if (followerRatio > 0.1) {
    fakePct += 3;
  } else if (followerRatio < 0.02) {
    fakePct -= 3;
  }

  if (engagementRatio < 0.2) {
    fakePct += 28;
  } else if (engagementRatio < 0.4) {
    fakePct += 20;
  } else if (engagementRatio < 0.6) {
    fakePct += 12;
  } else if (engagementRatio < 0.8) {
    fakePct += 6;
  } else if (engagementRatio > 1.8) {
    fakePct -= 4;
  } else if (engagementRatio > 1.2) {
    fakePct -= 2;
  }

  if (commentRatio === null) {
    // No visible likes: the comment-to-like ratio is unknown, not suspicious.
  } else if (commentRatio < 0.4) {
    fakePct += 8;
  } else if (commentRatio < 0.8) {
    fakePct += 4;
  } else if (commentRatio > 12) {
    fakePct += 7;
  }

  // Ordinary creator posts often differ 3-4x from each other, so only an
  // extreme spread between typical posts counts as a warning sign.
  if (variability > 2.5) {
    fakePct += 9;
  } else if (variability > 1.8) {
    fakePct += 5;
  } else if (variability > 1.2) {
    fakePct += 2;
  } else if (visible.length >= 4 && variability < 0.2) {
    fakePct -= 2;
  }

  // Unknown verification (Business Discovery never returns the badge) adds no
  // bonus and no penalty; it lowers confidence instead.
  if (profile.isVerified && !profile.verificationUnknown) {
    fakePct -= 7;
  }

  if (profile.followers > 1_000_000) {
    fakePct += 5;
  } else if (profile.followers > 500_000) {
    fakePct += 3;
  } else if (profile.followers < 10_000) {
    fakePct -= 1;
  }

  if (profile.postsCount < 30 && profile.followers > 5_000) {
    fakePct += 6;
  } else if (profile.postsCount > 500) {
    fakePct -= 2;
  }

  fakePct = clamp(fakePct, 2, 65);

  const authenticityPct = 100 - fakePct;
  const fakeFollowers = Math.round((profile.followers * fakePct) / 100);

  // Viral posts do bring followers, so growth uses the mean of posts with
  // visible likes against the account-mean benchmark.
  const meanRatio = likesKnown ? engagementRate / benchmarkEngagementRate(profile.followers) : 1;
  let growthPct = 6;
  growthPct += clamp((meanRatio - 1) * 10, -12, 18);
  growthPct += clamp((authenticityPct - 85) * 0.2, -10, 3);
  if (cadence !== null) {
    growthPct += clamp((cadence - 3) * 1.5, -4, 6);
  }
  if (reachRatio !== null) {
    growthPct += clamp((reachRatio - 0.5) * 8, -6, 12);
  }
  if (trend !== null) {
    growthPct += clamp(trend * 0.15, -6, 8);
  }
  if (followerRatio > 0.5) {
    growthPct -= 6;
  } else if (followerRatio < 0.1) {
    growthPct += 2;
  }
  if (profile.followers > 1_000_000) {
    growthPct -= 3;
  } else if (profile.followers > 500_000) {
    growthPct -= 2;
  } else if (profile.followers < 1_000) {
    growthPct += 3;
  } else if (profile.followers < 10_000) {
    growthPct += 2;
  }
  growthPct = clamp(growthPct, -20, 90);

  const signals: EstimateSignal[] = [
    {
      label: "Follower / following balance",
      value: `${profile.following.toLocaleString("en-US")} following (${round2(followerRatio * 100)}% of followers)`,
      impact:
        followerRatio < 0.1 ? "positive" : followerRatio > 0.5 ? "negative" : "neutral",
    },
    {
      label: "Engagement vs size benchmark",
      value: likesKnown
        ? `typical post ${round2(typicalRate)}% vs ${round2(benchmark)}% expected`
        : "Likes hidden on every recent post",
      impact:
        engagementRatio >= 1 ? "positive" : engagementRatio >= 0.7 ? "neutral" : "negative",
    },
    {
      label: "Comments per 100 likes",
      value: commentRatio === null ? "Likes hidden" : `${round2(commentRatio)}`,
      impact:
        commentRatio === null
          ? "neutral"
          : commentRatio < 0.4 || commentRatio > 12
            ? "negative"
            : commentRatio >= 1
              ? "positive"
              : "neutral",
    },
    {
      label: "Engagement stability",
      value:
        visible.length < 4
          ? "Not enough posts with visible likes"
          : `${round2(variability)} spread across typical posts`,
      impact:
        visible.length < 4
          ? "neutral"
          : variability <= 0.8
            ? "positive"
            : variability > 1.8
              ? "negative"
              : "neutral",
    },
    {
      label: "Posting cadence",
      value: cadence === null ? "Not enough posts" : `${round2(cadence)} posts / week`,
      impact:
        cadence === null ? "neutral" : cadence > 21 ? "negative" : cadence >= 2 ? "positive" : "neutral",
    },
    {
      label: "Verification",
      value: profile.verificationUnknown
        ? "Unknown (not exposed by this data source)"
        : profile.isVerified
          ? "Verified badge"
          : "No badge",
      impact: profile.isVerified && !profile.verificationUnknown ? "positive" : "neutral",
    },
  ];

  if (hiddenLikePosts > 0) {
    signals.push({
      label: "Hidden like counts",
      value: `${hiddenLikePosts} of ${posts.length} posts left out of like-based signals`,
      impact: "neutral",
    });
  }

  if (reachRatio !== null) {
    signals.push({
      label: "Public reach proxy",
      value: `${round2(reachRatio * 100)}% of followers`,
      impact: reachRatio >= 0.5 ? "positive" : reachRatio < 0.2 ? "negative" : "neutral",
    });
  }

  const baseConfidence: EstimateConfidence =
    visible.length >= 10 && (profile.isVerified || profile.followers >= 10_000)
      ? "high"
      : visible.length >= 5
        ? "medium"
        : "low";
  const confidence: EstimateConfidence = profile.verificationUnknown
    ? baseConfidence === "high"
      ? "medium"
      : "low"
    : baseConfidence;
  const halfWidth = RANGE_HALF_WIDTH[confidence];

  return {
    fakeFollowers,
    fakeFollowersPct: round2(fakePct),
    fakeFollowersLowPct: round2(clamp(fakePct - halfWidth, 1, 70)),
    fakeFollowersHighPct: round2(clamp(fakePct + halfWidth, 1, 70)),
    fakeFollowerRisk: fakeFollowerRisk(fakePct),
    authenticityPct: round2(authenticityPct),
    followerGrowthPct: round2(growthPct),
    confidence,
    signals,
    methodology: METHODOLOGY,
  };
}
