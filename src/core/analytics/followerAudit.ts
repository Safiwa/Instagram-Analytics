// Follower-level fake detection. Each sampled follower is scored on account
// signals drawn from published fake-follower research (Cresci et al. 2015,
// "Fame for sale", and the rule sets it evaluated). No single signal proves an
// account is fake: signals add up and an account counts as fake only past a
// threshold. The share of fake accounts in a random sample, with a confidence
// interval, then stands for the whole audience.
//
// Instagram's API cannot list another account's followers, so this runs only
// when a follower sample is supplied (a data provider, or an uploaded list).
// Without one, metrics.ts keeps the profile-level modeled range.

export type FollowerSample = {
  username: string;
  fullName?: string;
  // Unknown fields stay undefined and add nothing to the score.
  posts?: number;
  followers?: number;
  following?: number;
  hasProfilePic?: boolean;
  bio?: string;
  isPrivate?: boolean;
};

export type FollowerReason =
  | "no-posts"
  | "numeric-handle"
  | "digit-suffix-handle"
  | "no-profile-photo"
  | "follow-ratio"
  | "near-follow-cap"
  | "empty-profile"
  | "zero-following"
  | "empty-private";

export const FOLLOWER_REASON_LABEL: Record<FollowerReason, string> = {
  "no-posts": "No posts",
  "numeric-handle": "Handle is mostly or ends in a long run of digits",
  "digit-suffix-handle": "Handle ends in 4 digits that are not a birth year",
  "no-profile-photo": "No profile photo",
  "follow-ratio": "Follows far more accounts than follow it",
  "near-follow-cap": "Follows close to Instagram's 7,500 limit",
  "empty-profile": "No name and no bio",
  "zero-following": "Follows no one",
  "empty-private": "Private with no posts and no photo",
};

const WEIGHTS: Record<FollowerReason, number> = {
  "no-posts": 3,
  "numeric-handle": 3,
  "digit-suffix-handle": 1.5,
  "no-profile-photo": 2,
  "follow-ratio": 2,
  "near-follow-cap": 1.5,
  "empty-profile": 1,
  // Weak on its own: lurkers and new real users often follow no one.
  "zero-following": 1,
  "empty-private": 1,
};

// Score at which a follower counts as fake. Two strong signals (e.g. no posts
// and a bot-style handle) reach it; weak signals alone do not.
export const FAKE_THRESHOLD = 5;

// Below this many sampled followers the share is too uncertain to report.
export const MIN_AUDIT_SAMPLE = 50;

const YEAR_MIN = 1950;
const YEAR_MAX = 2015;

function handleSignal(username: string): FollowerReason | null {
  const handle = username.toLowerCase().replace(/^@/, "");
  const digits = (handle.match(/\d/g) ?? []).length;
  const letters = (handle.match(/[a-z]/g) ?? []).length;

  // e.g. "sara83920174", "user_5512093", "48291077".
  if (/\d{5,}$/.test(handle) || (digits >= 5 && digits >= letters)) {
    return "numeric-handle";
  }

  // "ahmed2741" is bot-like; "ahmed1994" is a common birth-year handle.
  const four = handle.match(/(?:^|\D)(\d{4})$/);
  if (four) {
    const value = Number(four[1]);
    return value >= YEAR_MIN && value <= YEAR_MAX ? null : "digit-suffix-handle";
  }

  return null;
}

export type FollowerVerdict = {
  username: string;
  score: number;
  fake: boolean;
  reasons: FollowerReason[];
};

export function scoreFollower(follower: FollowerSample): FollowerVerdict {
  const reasons: FollowerReason[] = [];

  if (follower.posts === 0) {
    reasons.push("no-posts");
  }

  const handle = handleSignal(follower.username);
  if (handle) {
    reasons.push(handle);
  }

  if (follower.hasProfilePic === false) {
    reasons.push("no-profile-photo");
  }

  if (typeof follower.following === "number" && typeof follower.followers === "number") {
    if (follower.following >= 500 && follower.following > 10 * Math.max(follower.followers, 1)) {
      reasons.push("follow-ratio");
    }
  }

  if (typeof follower.following === "number" && follower.following >= 7_000) {
    reasons.push("near-follow-cap");
  }

  if (
    follower.fullName !== undefined &&
    follower.bio !== undefined &&
    follower.fullName.trim() === "" &&
    follower.bio.trim() === ""
  ) {
    reasons.push("empty-profile");
  }

  if (follower.following === 0) {
    reasons.push("zero-following");
  }

  if (follower.isPrivate && follower.posts === 0 && follower.hasProfilePic === false) {
    reasons.push("empty-private");
  }

  const score = reasons.reduce((total, reason) => total + WEIGHTS[reason], 0);
  return { username: follower.username, score, fake: score >= FAKE_THRESHOLD, reasons };
}

export type FollowerAudit = {
  sampleSize: number;
  fakeCount: number;
  fakeSharePct: number;
  // 95% Wilson score interval for the fake share. It stays inside 0-100% and
  // holds up for small shares and samples, unlike a plain ± margin.
  lowPct: number;
  highPct: number;
  estimatedFakeFollowers: number;
  // How often each signal fired among the accounts judged fake.
  reasonCounts: Partial<Record<FollowerReason, number>>;
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function wilson(fake: number, n: number, z = 1.96): { low: number; high: number } {
  const p = fake / n;
  const denominator = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return {
    low: Math.max(0, (centre - spread) / denominator),
    high: Math.min(1, (centre + spread) / denominator),
  };
}

export function auditFollowers(
  sample: FollowerSample[],
  totalFollowers: number,
): FollowerAudit | null {
  // Duplicates would double-count one account.
  const unique = [...new Map(sample.map((item) => [item.username.toLowerCase(), item])).values()];
  if (unique.length < MIN_AUDIT_SAMPLE || totalFollowers <= 0) {
    return null;
  }

  const verdicts = unique.map(scoreFollower);
  const fake = verdicts.filter((verdict) => verdict.fake);
  const reasonCounts: Partial<Record<FollowerReason, number>> = {};
  for (const verdict of fake) {
    for (const reason of verdict.reasons) {
      reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    }
  }

  const share = fake.length / unique.length;
  const interval = wilson(fake.length, unique.length);

  return {
    sampleSize: unique.length,
    fakeCount: fake.length,
    fakeSharePct: round2(share * 100),
    lowPct: round2(interval.low * 100),
    highPct: round2(interval.high * 100),
    estimatedFakeFollowers: Math.round(totalFollowers * share),
    reasonCounts,
  };
}
