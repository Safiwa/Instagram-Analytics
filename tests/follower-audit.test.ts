import { describe, expect, it } from "vitest";
import {
  auditFollowers,
  FAKE_THRESHOLD,
  MIN_AUDIT_SAMPLE,
  scoreFollower,
  type FollowerSample,
} from "../src/core/analytics/followerAudit";
import { computeMetrics, describeFakeFollowers } from "../src/core/analytics/metrics";
import type { CreatorProfile } from "../src/core/data/types";

const real: FollowerSample = {
  username: "lina.designs",
  fullName: "Lina",
  posts: 84,
  followers: 620,
  following: 410,
  hasProfilePic: true,
  bio: "Designer in Dubai",
  isPrivate: false,
};

const bot: FollowerSample = {
  username: "sara83920174",
  fullName: "",
  posts: 0,
  followers: 3,
  following: 2_900,
  hasProfilePic: false,
  bio: "",
  isPrivate: false,
};

describe("follower scoring", () => {
  it("flags a bot-style account on several signals", () => {
    const verdict = scoreFollower(bot);
    expect(verdict.fake).toBe(true);
    expect(verdict.reasons).toEqual(
      expect.arrayContaining(["no-posts", "numeric-handle", "no-profile-photo", "follow-ratio"]),
    );
  });

  it("passes an ordinary real account", () => {
    expect(scoreFollower(real)).toMatchObject({ fake: false, score: 0 });
  });

  it("treats birth-year handles as normal but other 4-digit suffixes as a weak sign", () => {
    expect(scoreFollower({ username: "ahmed1994" }).reasons).toEqual([]);
    expect(scoreFollower({ username: "ahmed2741" }).reasons).toEqual(["digit-suffix-handle"]);
    expect(scoreFollower({ username: "user_5512093" }).reasons).toEqual(["numeric-handle"]);
    expect(scoreFollower({ username: "48291077" }).reasons).toEqual(["numeric-handle"]);
  });

  it("does not call an account fake for zero following or zero posts alone", () => {
    expect(scoreFollower({ ...real, following: 0 }).fake).toBe(false);
    expect(scoreFollower({ ...real, posts: 0 }).fake).toBe(false);
    // Two strong signals together cross the threshold.
    expect(scoreFollower({ ...real, username: "mona99381722", posts: 0 }).score).toBeGreaterThanOrEqual(
      FAKE_THRESHOLD,
    );
  });

  it("ignores fields the source did not provide", () => {
    expect(scoreFollower({ username: "plain.name" })).toMatchObject({ score: 0, reasons: [] });
  });
});

function sample(fake: number, total: number): FollowerSample[] {
  return Array.from({ length: total }, (_, index) =>
    index < fake
      ? { ...bot, username: `bot${10_000_000 + index}` }
      : { ...real, username: `real.user.${index}` },
  );
}

describe("follower audit", () => {
  it("returns the fake share with a 95% Wilson interval", () => {
    const audit = auditFollowers(sample(40, 400), 1_000_000)!;
    expect(audit.sampleSize).toBe(400);
    expect(audit.fakeSharePct).toBe(10);
    expect(audit.lowPct).toBeCloseTo(7.43, 1);
    expect(audit.highPct).toBeCloseTo(13.35, 1);
    expect(audit.estimatedFakeFollowers).toBe(100_000);
    expect(audit.reasonCounts["no-posts"]).toBe(40);
  });

  it("refuses samples that are too small and ignores duplicates", () => {
    expect(auditFollowers(sample(5, MIN_AUDIT_SAMPLE - 1), 10_000)).toBeNull();
    const small = sample(5, MIN_AUDIT_SAMPLE - 1);
    const duplicated = [...small, { ...small[0], username: small[0].username.toUpperCase() }];
    expect(auditFollowers(duplicated, 10_000)).toBeNull();
  });
});

describe("metrics with a follower sample", () => {
  const base: CreatorProfile = {
    username: "audited",
    displayName: "Audited",
    category: "Creator",
    bio: "",
    followers: 200_000,
    following: 300,
    postsCount: 400,
    isVerified: false,
    source: "live",
    followerHistory: [],
    recentPosts: Array.from({ length: 10 }, (_, index) => ({
      id: `p${index}`,
      type: "Reel" as const,
      caption: "",
      postedAt: new Date(Date.UTC(2026, 10, 1 + index)).toISOString(),
      likes: 3_000,
      comments: 60,
      hashtags: [],
    })),
  };

  it("uses the audit instead of the profile model when a sample exists", () => {
    const metrics = computeMetrics({ ...base, followerSample: sample(60, 300) });
    expect(metrics.fakeFollowerSource).toBe("follower-audit");
    expect(metrics.fakeFollowersPct).toBe(20);
    expect(metrics.authenticityPct).toBe(80);
    expect(describeFakeFollowers(metrics)).toMatch(/^1\d-2\d% \(Medium risk\)$/);
  });

  it("falls back to the modeled range without a usable sample", () => {
    const metrics = computeMetrics({ ...base, followerSample: sample(2, 10) });
    expect(metrics.fakeFollowerSource).toBe("modeled");
    expect(metrics.followerAudit).toBeNull();
  });
});
