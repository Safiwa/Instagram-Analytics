import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  addTrackedHandle,
  applySubscriptionEvent,
  claimLoginEmailSlot,
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
  planForVariant,
  variantFor,
  verifyWebhookSignature,
} from "../src/core/billing/lemonsqueezy";
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
const ENV_KEYS = [
  "LEMONSQUEEZY_API_KEY",
  "LEMONSQUEEZY_STORE_ID",
  "LEMONSQUEEZY_WEBHOOK_SECRET",
  "LEMONSQUEEZY_VARIANT_STARTER_MONTHLY",
  "LEMONSQUEEZY_VARIANT_PRO_MONTHLY",
  "LEMONSQUEEZY_VARIANT_PRO_YEARLY",
  "LEMONSQUEEZY_VARIANT_AGENCY_MONTHLY",
  "CONNECT_SECRET",
  "RESEND_API_KEY",
  "DIGEST_FROM_EMAIL",
];
const saved: Record<string, string | undefined> = {};

function configureBilling() {
  process.env.LEMONSQUEEZY_API_KEY = "test-key";
  process.env.LEMONSQUEEZY_STORE_ID = "1001";
  process.env.LEMONSQUEEZY_WEBHOOK_SECRET = "whsec-test";
  process.env.LEMONSQUEEZY_VARIANT_STARTER_MONTHLY = "11";
  process.env.LEMONSQUEEZY_VARIANT_PRO_MONTHLY = "22";
  process.env.LEMONSQUEEZY_VARIANT_PRO_YEARLY = "23";
  process.env.LEMONSQUEEZY_VARIANT_AGENCY_MONTHLY = "33";
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

describe("lemon squeezy", () => {
  it("stays off until keys, variants, database, secret and email are all set", () => {
    for (const key of ENV_KEYS) delete process.env[key];
    expect(billingConfig()).toBeNull();
    expect(isBillingEnabled()).toBe(false);
    configureBilling();
    expect(billingConfig()).not.toBeNull();
    // No DATABASE_URL / CONNECT_SECRET / Resend in the test environment.
    expect(isBillingEnabled()).toBe(false);
  });

  it("maps variants to plans both ways", () => {
    configureBilling();
    const config = billingConfig()!;
    expect(variantFor(config, "pro", "yearly")).toBe("23");
    expect(variantFor(config, "starter", "yearly")).toBeNull();
    expect(planForVariant(config, 22)).toBe("pro");
    expect(planForVariant(config, "33")).toBe("agency");
    expect(planForVariant(config, "999")).toBeNull();
  });

  it("verifies the X-Signature HMAC", () => {
    const body = '{"hello":"world"}';
    const signature = createHmac("sha256", "secret").update(body).digest("hex");
    expect(verifyWebhookSignature(body, signature, "secret")).toBe(true);
    expect(verifyWebhookSignature(body, signature, "other")).toBe(false);
    expect(verifyWebhookSignature(body, null, "secret")).toBe(false);
  });

  it("parses subscription events and ignores others", () => {
    expect(parseSubscriptionEvent({ meta: { event_name: "order_created" }, data: { type: "orders" } })).toBeNull();
    const event = parseSubscriptionEvent(subscriptionPayload("subscription_created", { status: "on_trial" }));
    expect(event).toMatchObject({
      event: "subscription_created",
      userId: null,
      email: "buyer@example.com",
      subscriptionId: "sub_1",
      variantId: "22",
      status: "on_trial",
      customerPortalUrl: "https://store.lemonsqueezy.com/billing",
    });
  });
});

function subscriptionPayload(event: string, attributes: Record<string, unknown> = {}, userId?: string) {
  return {
    meta: { event_name: event, custom_data: userId ? { user_id: userId } : undefined },
    data: {
      type: "subscriptions",
      id: "sub_1",
      attributes: {
        status: "active",
        variant_id: 22,
        customer_id: 555,
        user_email: "Buyer@Example.com",
        trial_ends_at: "2026-12-10T00:00:00.000000Z",
        renews_at: "2026-12-10T00:00:00.000000Z",
        ends_at: null,
        urls: { customer_portal: "https://store.lemonsqueezy.com/billing" },
        ...attributes,
      },
    },
  };
}

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
    const created = parseSubscriptionEvent(subscriptionPayload("subscription_created", { status: "on_trial" }, user.id))!;
    expect(await applySubscriptionEvent(created, "pro")).toBe(true);
    const cancelled = parseSubscriptionEvent(
      subscriptionPayload("subscription_cancelled", { status: "cancelled", ends_at: "2026-12-10T00:00:00Z" }, user.id),
    )!;
    await applySubscriptionEvent(cancelled, "pro");
    const subs = await listSubscriptions(user.id);
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ plan: "pro", status: "cancelled" });
    expect(effectivePlan(subs, NOW)).toBe("pro");

    // No custom data: the checkout email creates/links the account.
    const byEmail = parseSubscriptionEvent({
      ...subscriptionPayload("subscription_created"),
      data: { ...subscriptionPayload("subscription_created").data, id: "sub_2" },
    })!;
    expect(await applySubscriptionEvent(byEmail, "starter")).toBe(true);
    const buyer = await db.query<{ id: string }>("select id from site_users where email = 'buyer@example.com'");
    expect(await listSubscriptions(buyer.rows[0].id)).toHaveLength(1);
  });

  it("webhook route rejects bad signatures and applies signed events", async () => {
    configureBilling();
    const user = await upsertUser("hook@example.com");
    const body = JSON.stringify(subscriptionPayload("subscription_created", { status: "on_trial" }, user.id));
    const signature = createHmac("sha256", "whsec-test").update(body).digest("hex");

    const rejected = await webhook(
      new Request("http://localhost/api/billing/webhook", { method: "POST", body, headers: { "x-signature": "bad" } }),
    );
    expect(rejected.status).toBe(401);

    const accepted = await webhook(
      new Request("http://localhost/api/billing/webhook", { method: "POST", body, headers: { "x-signature": signature } }),
    );
    expect(accepted.status).toBe(200);
    expect((await listSubscriptions(user.id))[0]).toMatchObject({ plan: "pro", status: "on_trial" });
  });
});
