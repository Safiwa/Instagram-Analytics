import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProfileMetrics } from "../src/core/analytics/metrics";
import { buildDigestEmail } from "../src/core/digest/email";
import {
  isSubscriptionDue,
  listDueSubscriptions,
  type DigestSubscription,
} from "../src/core/digest/subscriptions";
import { createUnsubscribeToken, readUnsubscribeToken } from "../src/core/digest/tokens";
import { trialEndsAt, validateSignup } from "../src/core/digest/validation";

const metrics = {
  avgLikes: 100,
  avgComments: 10,
  avgSaves: null,
  engagementRate: 1.23,
  typicalEngagementRate: null,
  hiddenLikePosts: 0,
  engagementBasis: "likes+comments",
  engagementSource: "public-posts",
  storedEngagement: null,
  fakeFollowers: null,
  fakeFollowersPct: null,
  fakeFollowersRange: null,
  fakeFollowerRisk: null,
  fakeFollowerSource: null,
  followerAudit: null,
  followerGrowthPct: 4.56,
  authenticityPct: null,
  growthEstimated: true,
  authenticityEstimated: false,
  estimateConfidence: "medium",
  estimateSignals: [],
  estimateMethodology: "Public signals",
} as ProfileMetrics;

const unsubscribeUrl = "https://www.instagram-analytics.com/api/digest/unsubscribe?token=abc.def";

describe("weekly digest signup validation", () => {
  it("normalizes a valid signup", () => {
    const result = validateSignup({
      email: "  User@Example.COM ",
      handle: "@NatGeo",
      consent: true,
      company: "",
    });

    expect(result).toEqual({ ok: true, value: { email: "user@example.com", handle: "natgeo" } });
  });

  it("rejects invalid email addresses", () => {
    expect(validateSignup({ email: "bad", handle: "natgeo", consent: true }).ok).toBe(false);
  });

  it("rejects invalid handles", () => {
    expect(validateSignup({ email: "a@b.com", handle: "bad handle!", consent: true }).ok).toBe(false);
  });

  it("requires explicit consent", () => {
    expect(validateSignup({ email: "a@b.com", handle: "natgeo", consent: false }).ok).toBe(false);
  });

  it("silently rejects honeypot submissions", () => {
    expect(
      validateSignup({ email: "a@b.com", handle: "natgeo", consent: true, company: "bot" }),
    ).toEqual({ ok: false, message: "Invalid submission." });
  });

  it("sets a 30-day trial end", () => {
    const start = new Date("2026-11-20T00:00:00.000Z");
    expect(trialEndsAt(start)).toBe("2026-12-20T00:00:00.000Z");
  });
});

describe("weekly digest email", () => {
  it("includes the requested metrics and labels estimates", () => {
    const email = buildDigestEmail({
      handle: "natgeo",
      displayName: "National <Geographic>",
      followers: 268000000,
      metrics,
      sentAt: new Date("2026-11-23T08:00:00.000Z"),
      unsubscribeUrl,
    });

    expect(email.subject).toContain("@natgeo");
    expect(email.text).toContain("Engagement rate: 1.23%");
    expect(email.text).toContain("12-month follower growth: 4.56% (Est.)");
    expect(email.text).toContain("https://www.instagram-analytics.com/profile/natgeo");
    expect(email.text).toContain(unsubscribeUrl);
    expect(email.html).toContain("National &lt;Geographic&gt;");
    expect(email.html).toContain("4.56% (Est.)");
    expect(email.html).toContain("First report - comparison starts next week");
  });

  it("shows follower decrease and engagement change since the previous report", () => {
    const email = buildDigestEmail({
      handle: "natgeo",
      displayName: "National Geographic",
      followers: 268000000,
      metrics,
      sentAt: new Date("2026-11-30T08:00:00.000Z"),
      previous: { followers: 268100000, engagementRate: 1.5 },
      unsubscribeUrl,
    });

    expect(email.text).toContain("Followers vs last week: -100K (-0.04%)");
    expect(email.text).toContain("Engagement rate vs last week: -0.27 pp");
    expect(email.html).toContain("Followers vs last week");
    expect(email.html).toContain("-100K (-0.04%)");
    expect(email.html).toContain("-0.27 pp");
  });
});

describe("weekly digest schedule", () => {
  const subscription: DigestSubscription = {
    email: "user@example.com",
    handle: "natgeo",
    createdAt: "2026-11-01T00:00:00.000Z",
    trialEndsAt: "2026-12-01T00:00:00.000Z",
  };

  it("does not stop after the displayed 30-day trial", () => {
    expect(isSubscriptionDue(subscription, new Date("2027-01-01T00:00:00.000Z"))).toBe(true);
  });

  it("keeps the six-day guard between sends", () => {
    const recent: DigestSubscription = {
      ...subscription,
      lastSentAt: "2026-11-19T00:00:00.000Z",
    };
    expect(isSubscriptionDue(recent, new Date("2026-11-20T00:00:00.000Z"))).toBe(false);
    expect(isSubscriptionDue(recent, new Date("2026-11-26T00:00:00.000Z"))).toBe(true);
  });
});

describe("weekly digest Upstash store", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reads due subscriptions from JSON strings returned by Upstash GET", async () => {
    const record: DigestSubscription = {
      email: "user@example.com",
      handle: "natgeo",
      createdAt: "2026-11-01T00:00:00.000Z",
      trialEndsAt: "2026-12-01T00:00:00.000Z",
    };
    const key = "digest:sub:abc123";
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");

    const commands: unknown[][] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        const command = JSON.parse(init.body) as unknown[];
        commands.push(command);
        const result =
          command[0] === "KEYS" ? [key] : command[0] === "GET" ? JSON.stringify(record) : null;
        return new Response(JSON.stringify({ result }), { status: 200 });
      }),
    );

    const due = await listDueSubscriptions(new Date("2026-11-21T00:00:00.000Z"));
    expect(due).toEqual([record]);
    expect(commands.map((command) => command[0])).toEqual(["KEYS", "GET"]);
  });
});

describe("weekly digest unsubscribe token", () => {
  it("round-trips an identity and rejects a wrong secret", () => {
    const token = createUnsubscribeToken("user@example.com", "natgeo", "test-secret");
    expect(readUnsubscribeToken(token, "test-secret")).toEqual({
      email: "user@example.com",
      handle: "natgeo",
    });
    expect(readUnsubscribeToken(token, "wrong-secret")).toBeNull();
    expect(readUnsubscribeToken("not-a-token", "test-secret")).toBeNull();
  });
});
