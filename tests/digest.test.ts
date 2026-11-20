import { describe, expect, it } from "vitest";
import type { ProfileMetrics } from "../src/core/analytics/metrics";
import { buildDigestEmail } from "../src/core/digest/email";
import { trialEndsAt, validateSignup } from "../src/core/digest/validation";

const metrics = {
  avgLikes: 100,
  avgComments: 10,
  avgSaves: null,
  engagementRate: 1.23,
  engagementBasis: "likes+comments",
  fakeFollowers: null,
  fakeFollowersPct: null,
  followerGrowthPct: 4.56,
  authenticityPct: null,
  growthEstimated: true,
  authenticityEstimated: false,
  estimateConfidence: "medium",
  estimateSignals: [],
  estimateMethodology: "Public signals",
} as ProfileMetrics;

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
    });

    expect(email.subject).toContain("@natgeo");
    expect(email.text).toContain("Engagement rate: 1.23%");
    expect(email.text).toContain("12-month follower growth: 4.56% (Est.)");
    expect(email.text).toContain("https://www.instagram-analytics.com/profile/natgeo");
    expect(email.html).toContain("National &lt;Geographic&gt;");
    expect(email.html).toContain("4.56% (Est.)");
  });
});
