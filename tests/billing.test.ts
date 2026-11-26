import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  addTrackedHandle,
  applySubscriptionEvent,
  claimLoginEmailSlot,
  hasHadSubscription,
  countLookups,
  hasLookedUp,
  listSubscriptions,
  listTrackedHandles,
  normalizeEmail,
  recordLookups,
  removeTrackedHandle,
  upsertUser,
} from "../src/core/billing/accounts";
import {
  billingConfig,
  isBillingEnabled,
  parseSubscriptionEvent,
  planForProduct,
  productFor,
  verifyWebhookSignature,
} from "../src/core/billing/dodo";
import {
  cheapestPlanWith,
  effectivePlan,
  grantsAccess,
  PLANS,
  trimHistory,
  usagePeriod,
} from "../src/core/billing/plans";
import { safeNext } from "../src/core/billing/redirect";
import { emailFromLoginToken, isSearchCrawler, loginToken } from "../src/core/billing/viewer";
import { setSqlRunnerForTests } from "../src/core/db/client";
import { POST as webhook } from "../src/app/api/billing/webhook/route";

const NOW = new Date("2026-11-26T10:00:00Z");
const SECRET = `whsec_${Buffer.from("test-signing-key").toString("base64")}`;
const ENV_KEYS = [
  "DODO_PAYMENTS_API_KEY",
  "DODO_PAYMENTS_WEBHOOK_SECRET",
  "DODO_PAYMENTS_MODE",
  "DODO_PRODUCT_STARTER_MONTHLY",
  "DODO_PRODUCT_PRO_MONTHLY",
  "DODO_PRODUCT_PRO_YEARLY",
  "DODO_PRODUCT_AGENCY_MONTHLY",
  "CONNECT_SECRET",
  "RESEND_API_KEY",
  "DIGEST_FROM_EMAIL",
];
const saved: Record<string, string | undefined> = {};

function configureBilling() {
  process.env.DODO_PAYMENTS_API_KEY = "test-key";
  process.env.DODO_PAYMENTS_WEBHOOK_SECRET = SECRET;
  process.env.DODO_PRODUCT_STARTER_MONTHLY = "pdt_starter";
  process.env.DODO_PRODUCT_PRO_MONTHLY = "pdt_pro";
  process.env.DODO_PRODUCT_PRO_YEARLY = "pdt_pro_year";
  process.env.DODO_PRODUCT_AGENCY_MONTHLY = "pdt_agency";
}

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
});
afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("plans", () => {
  it("defines three paid tiers above free with growing limits", () => {
    expect([PLANS.starter.monthlyUsd, PLANS.pro.monthlyUsd, PLANS.agency.monthlyUsd]).toEqual([9, 29, 79]);
    expect(PLANS.pro.trialDays).toBe(14);
    expect(PLANS.free.limits.lookups).toBe(3);
    expect(PLANS.free.limits.lookupPeriod).toBe("day");
    expect(PLANS.agency.limits.compareMax).toBe(4);
    expect(cheapestPlanWith((limits) => limits.pdfReport)).toBe("pro");
    expect(cheapestPlanWith((limits) => limits.trackedAccounts > 0)).toBe("starter");
  });

  it("grants access for trials, active and cancelled-but-paid-up subscriptions only", () => {
    expect(grantsAccess({ plan: "pro", status: "on_trial", endsAt: null }, NOW)).toBe(true);
    expect(grantsAccess({ plan: "pro", status: "cancelled", endsAt: "2026-12-01T00:00:00Z" }, NOW)).toBe(true);
    expect(grantsAccess({ plan: "pro", status: "cancelled", endsAt: "2026-11-01T00:00:00Z" }, NOW)).toBe(false);
    expect(grantsAccess({ plan: "pro", status: "expired", endsAt: null }, NOW)).toBe(false);
    expect(
      effectivePlan(
        [
          { plan: "starter", status: "active", endsAt: null },
          { plan: "agency", status: "expired", endsAt: null },
          { plan: "pro", status: "on_trial", endsAt: null },
        ],
        NOW,
      ),
    ).toBe("pro");
    expect(effectivePlan([], NOW)).toBe("free");
  });

  it("uses daily periods for free and monthly periods for paid plans", () => {
    expect(usagePeriod(PLANS.free.limits, NOW)).toBe("2026-11-26");
    expect(usagePeriod(PLANS.pro.limits, NOW)).toBe("2026-11");
  });

  it("trims stored history to the plan window", () => {
    const points = ["2026-01-01", "2026-11-10", "2026-11-25"].map((date) => ({ date }));
    expect(trimHistory(points, 7, NOW).map((point) => point.date)).toEqual(["2026-11-25"]);
    expect(trimHistory(points, 90, NOW)).toHaveLength(2);
    expect(trimHistory(points, null, NOW)).toHaveLength(3);
  });
});

describe("sign-in helpers", () => {
  it("round-trips a signed login token and rejects tampering", () => {
    process.env.CONNECT_SECRET = "x".repeat(40);
    const token = loginToken("Safi@example.com");
    expect(emailFromLoginToken(token)).toBe("Safi@example.com");
    expect(emailFromLoginToken(`${token}x`)).toBeNull();
    expect(emailFromLoginToken(null)).toBeNull();
  });

  it("normalises emails and only allows same-site redirects", () => {
    expect(normalizeEmail("  Safi@Example.COM ")).toBe("safi@example.com");
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(safeNext("/profile/nora.style")).toBe("/profile/nora.style");
    expect(safeNext("//evil.example")).toBe("/account");
    expect(safeNext("https://evil.example")).toBe("/account");
  });

  it("never meters search-engine crawlers", () => {
    expect(isSearchCrawler("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isSearchCrawler("Mozilla/5.0 (Windows NT 10.0) Chrome/140")).toBe(false);
  });
});

function sign(body: string, id: string, timestamp: number, secret = SECRET): string {
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}

function subscriptionPayload(type: string, data: Record<string, unknown> = {}, userId?: string) {
  return {
    business_id: "bus_1",
    type,
    timestamp: "2026-11-26T09:30:00Z",
    data: {
      payload_type: "Subscription",
      subscription_id: "sub_1",
      product_id: "pdt_pro",
      status: "active",
      created_at: "2026-11-25T09:00:00Z",
      next_billing_date: "2026-12-25T09:00:00Z",
      cancel_at_next_billing_date: false,
      trial_period_days: 0,
      expires_at: null,
      customer: { customer_id: "cus_1", email: "Buyer@Example.com", name: "Buyer" },
      metadata: userId ? { user_id: userId } : {},
      ...data,
    },
  };
}

describe("dodo payments", () => {
  it("stays off until keys, products, database, secret and email are all set", () => {
    for (const key of ENV_KEYS) delete process.env[key];
    expect(billingConfig()).toBeNull();
    expect(isBillingEnabled()).toBe(false);
    configureBilling();
    expect(billingConfig()).not.toBeNull();
    // No DATABASE_URL / CONNECT_SECRET / Resend in the test environment.
    expect(isBillingEnabled()).toBe(false);
  });

  it("uses test mode unless DODO_PAYMENTS_MODE is live", () => {
    configureBilling();
    expect(billingConfig()!.baseUrl).toBe("https://test.dodopayments.com");
    process.env.DODO_PAYMENTS_MODE = "live";
    expect(billingConfig()!.baseUrl).toBe("https://live.dodopayments.com");
  });

  it("maps products to plans both ways", () => {
    configureBilling();
    const config = billingConfig()!;
    expect(productFor(config, "pro", "yearly")).toBe("pdt_pro_year");
    expect(productFor(config, "starter", "yearly")).toBeNull();
    expect(planForProduct(config, "pdt_pro")).toBe("pro");
    expect(planForProduct(config, "pdt_agency")).toBe("agency");
    expect(planForProduct(config, "pdt_other")).toBeNull();
  });

  it("verifies Standard Webhooks signatures with a replay window", () => {
    const body = '{"hello":"world"}';
    const now = 1_790_000_000;
    const signature = sign(body, "msg_1", now);
    const headers = { id: "msg_1", timestamp: String(now), signature };
    expect(verifyWebhookSignature(body, headers, SECRET, now)).toBe(true);
    expect(verifyWebhookSignature(body, { ...headers, signature: `v1,bad ${signature}` }, SECRET, now)).toBe(true);
    expect(verifyWebhookSignature(`${body} `, headers, SECRET, now)).toBe(false);
    expect(verifyWebhookSignature(body, { ...headers, id: "msg_2" }, SECRET, now)).toBe(false);
    expect(verifyWebhookSignature(body, headers, SECRET, now + 10 * 60)).toBe(false);
    expect(verifyWebhookSignature(body, { ...headers, signature: null }, SECRET, now)).toBe(false);
  });

  it("parses subscription events and ignores others", () => {
    expect(parseSubscriptionEvent({ type: "payment.succeeded", data: { payment_id: "pay_1" } })).toBeNull();
    const trial = parseSubscriptionEvent(subscriptionPayload("subscription.active", { trial_period_days: 14 }), NOW);
    expect(trial).toMatchObject({
      event: "subscription.active",
      userId: null,
      email: "buyer@example.com",
      subscriptionId: "sub_1",
      customerId: "cus_1",
      productId: "pdt_pro",
      status: "on_trial",
      trialEndsAt: "2026-12-09T09:00:00.000Z",
      endsAt: null,
    });
    const cancelling = parseSubscriptionEvent(
      subscriptionPayload("subscription.updated", { cancel_at_next_billing_date: true }),
      NOW,
    );
    expect(cancelling).toMatchObject({ status: "active", endsAt: "2026-12-25T09:00:00.000Z" });
  });
});

describe("billing storage (real Postgres)", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(await readFile("db/migrations/0008_billing.sql", "utf8"));
  });
  afterAll(async () => {
    setSqlRunnerForTests(undefined);
    await db.close();
  });
  beforeEach(async () => {
    await db.exec("truncate site_users, subscriptions, usage_lookups, user_tracked_handles cascade");
    setSqlRunnerForTests(async (text, params = []) => (await db.query(text, params)).rows as never);
  });

  it("rate-limits sign-in emails to one a minute per address", async () => {
    expect(await claimLoginEmailSlot("a@example.com", NOW)).toBe(true);
    expect(await claimLoginEmailSlot("a@example.com", new Date(NOW.getTime() + 10_000))).toBe(false);
    expect(await claimLoginEmailSlot("a@example.com", new Date(NOW.getTime() + 61_000))).toBe(true);
  });

  it("counts each profile once per period", async () => {
    await recordLookups("ip:abc", "2026-11-26", ["nora.style", "lumen.travel"]);
    await recordLookups("ip:abc", "2026-11-26", ["nora.style"]);
    await recordLookups("ip:abc", "2026-11-27", ["nora.style"]);
    expect(await countLookups("ip:abc", "2026-11-26")).toBe(2);
    expect(await hasLookedUp("ip:abc", "2026-11-26", "nora.style")).toBe(true);
    expect(await hasLookedUp("ip:other", "2026-11-26", "nora.style")).toBe(false);
  });

  it("caps tracked handles at the plan allowance", async () => {
    const user = await upsertUser("t@example.com");
    expect(await addTrackedHandle(user.id, "one", 1)).toBe(true);
    expect(await addTrackedHandle(user.id, "one", 1)).toBe(true);
    expect(await addTrackedHandle(user.id, "two", 1)).toBe(false);
    await removeTrackedHandle(user.id, "one");
    expect(await addTrackedHandle(user.id, "two", 1)).toBe(true);
    expect(await listTrackedHandles(user.id)).toEqual(["two"]);
  });

  it("links webhooks by custom user id, then by email, and updates in place", async () => {
    const user = await upsertUser("owner@example.com");
    expect(await hasHadSubscription(user.id)).toBe(false);
    const created = parseSubscriptionEvent(
      subscriptionPayload("subscription.active", { trial_period_days: 14 }, user.id),
      NOW,
    )!;
    expect(await applySubscriptionEvent(created, "pro")).toBe(true);
    expect(await hasHadSubscription(user.id)).toBe(true);
    const cancelling = parseSubscriptionEvent(
      {
        ...subscriptionPayload("subscription.updated", { cancel_at_next_billing_date: true }, user.id),
        timestamp: "2026-11-26T10:00:00Z",
      },
      NOW,
    )!;
    await applySubscriptionEvent(cancelling, "pro");
    // An older delivery arriving late must not undo the newer state.
    const stale = parseSubscriptionEvent(
      { ...subscriptionPayload("subscription.active", {}, user.id), timestamp: "2026-11-26T08:00:00Z" },
      NOW,
    )!;
    await applySubscriptionEvent(stale, "pro");
    const subs = await listSubscriptions(user.id);
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ plan: "pro", customerId: "cus_1", endsAt: "2026-12-25T09:00:00.000Z" });
    expect(effectivePlan(subs, NOW)).toBe("pro");

    // No metadata: the checkout email creates/links the account.
    const byEmail = parseSubscriptionEvent(subscriptionPayload("subscription.active", { subscription_id: "sub_2" }))!;
    expect(await applySubscriptionEvent(byEmail, "starter")).toBe(true);
    const buyer = await db.query<{ id: string }>("select id from site_users where email = 'buyer@example.com'");
    expect(await listSubscriptions(buyer.rows[0].id)).toHaveLength(1);
  });

  it("webhook route rejects bad signatures and applies signed events", async () => {
    configureBilling();
    const user = await upsertUser("hook@example.com");
    const body = JSON.stringify(subscriptionPayload("subscription.active", {}, user.id));
    const timestamp = Math.floor(Date.now() / 1000);
    const headers = { "webhook-id": "msg_9", "webhook-timestamp": String(timestamp) };

    const rejected = await webhook(
      new Request("http://localhost/api/billing/webhook", {
        method: "POST",
        body,
        headers: { ...headers, "webhook-signature": "v1,bad" },
      }),
    );
    expect(rejected.status).toBe(401);

    const accepted = await webhook(
      new Request("http://localhost/api/billing/webhook", {
        method: "POST",
        body,
        headers: { ...headers, "webhook-signature": sign(body, "msg_9", timestamp) },
      }),
    );
    expect(accepted.status).toBe(200);
    expect((await listSubscriptions(user.id))[0]).toMatchObject({ plan: "pro", status: "active" });
  });
});
