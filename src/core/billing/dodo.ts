import { createHmac, timingSafeEqual } from "node:crypto";
import { isDatabaseConfigured } from "../db/client";
import { isResendConfigured } from "../digest/resend";
import { isConnectSecretConfigured } from "../instagram/crypto";
import { log } from "../logging/logger";
import type { BillingInterval, PaidPlanId } from "./plans";

// Dodo Payments is the merchant of record: it takes the card, charges VAT and
// sales tax, runs the free trial and pays out to the owner's bank account. This
// module only creates hosted checkout sessions, opens the customer portal and
// reads Dodo's signed webhooks (Standard Webhooks format).

const BASE_URLS = {
  test: "https://test.dodopayments.com",
  live: "https://live.dodopayments.com",
} as const;

export type BillingConfig = {
  apiKey: string;
  webhookSecret: string;
  baseUrl: string;
  // plan -> interval -> Dodo product id (Products > the subscription product).
  products: Record<PaidPlanId, Partial<Record<BillingInterval, string>>>;
};

function env(name: string): string | null {
  return process.env[name]?.trim() || null;
}

export function billingConfig(): BillingConfig | null {
  const apiKey = env("DODO_PAYMENTS_API_KEY");
  const webhookSecret = env("DODO_PAYMENTS_WEBHOOK_SECRET");
  if (!apiKey || !webhookSecret) {
    return null;
  }
  // Test mode unless explicitly switched to live, so a half-finished setup
  // can never take real money.
  const baseUrl = env("DODO_PAYMENTS_MODE") === "live" ? BASE_URLS.live : BASE_URLS.test;
  const products = {} as BillingConfig["products"];
  for (const plan of ["starter", "pro", "agency"] as const) {
    const key = plan.toUpperCase();
    products[plan] = {};
    const monthly = env(`DODO_PRODUCT_${key}_MONTHLY`);
    const yearly = env(`DODO_PRODUCT_${key}_YEARLY`);
    if (monthly) products[plan].monthly = monthly;
    if (yearly) products[plan].yearly = yearly;
  }
  return { apiKey, webhookSecret, baseUrl, products };
}

// Paid plans switch on only when every piece is in place: Dodo keys, at least
// one product, the database (accounts + usage), CONNECT_SECRET (signed session
// cookies) and Resend (sign-in emails). Until then the site keeps working
// exactly as before with no limits.
//
// The production site additionally needs DODO_PAYMENTS_MODE=live: a test-mode
// checkout cannot take real money, so real visitors must never meet limits
// they cannot pay to lift. Preview deployments run in test mode as normal.
export function isBillingEnabled(): boolean {
  if (process.env.VERCEL_ENV === "production" && env("DODO_PAYMENTS_MODE") !== "live") {
    return false;
  }
  const config = billingConfig();
  const hasProduct =
    config !== null && Object.values(config.products).some((intervals) => Object.keys(intervals).length > 0);
  return hasProduct && isDatabaseConfigured() && isConnectSecretConfigured() && isResendConfigured();
}

export function productFor(config: BillingConfig, plan: PaidPlanId, interval: BillingInterval): string | null {
  return config.products[plan][interval] ?? null;
}

export function planForProduct(config: BillingConfig, productId: string | null | undefined): PaidPlanId | null {
  if (!productId) {
    return null;
  }
  for (const plan of ["starter", "pro", "agency"] as const) {
    if (Object.values(config.products[plan]).includes(productId)) {
      return plan;
    }
  }
  return null;
}

async function call(config: BillingConfig, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    log.error("dodo payments request rejected", { path: path.split("?")[0].split("/")[1] ?? "", status: response.status });
    throw new Error(`Dodo Payments rejected the request with status ${response.status}.`);
  }
  return (await response.json()) as Record<string, unknown>;
}

export async function createCheckout(
  config: BillingConfig,
  input: { productId: string; email: string; userId: string; returnUrl: string; trialDays: number },
): Promise<string> {
  const body = await call(config, "/checkouts", {
    product_cart: [{ product_id: input.productId, quantity: 1 }],
    customer: { email: input.email },
    metadata: { user_id: input.userId },
    // Overrides the product's own trial: the plan's trial for a first
    // subscription, none for returning customers.
    subscription_data: { trial_period_days: input.trialDays },
    return_url: input.returnUrl,
  });
  const url = body.checkout_url;
  if (typeof url !== "string" || !url.startsWith("https://")) {
    throw new Error("Dodo Payments returned no checkout URL.");
  }
  return url;
}

// Customer portal: change plan, update card, cancel, invoices.
export async function createPortalLink(config: BillingConfig, customerId: string, returnUrl: string): Promise<string> {
  const query = new URLSearchParams({ return_url: returnUrl });
  const body = await call(config, `/customers/${encodeURIComponent(customerId)}/customer-portal/session?${query}`);
  const link = body.link;
  if (typeof link !== "string" || !link.startsWith("https://")) {
    throw new Error("Dodo Payments returned no portal link.");
  }
  return link;
}

export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

// Standard Webhooks: HMAC-SHA256 over "<webhook-id>.<webhook-timestamp>.<raw body>"
// keyed with the base64-decoded secret (after the "whsec_" prefix), sent
// base64-encoded as one or more space-separated "v1,<signature>" entries.
export function verifyWebhookSignature(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !/^\d+$/.test(timestamp)) {
    return false;
  }
  if (Math.abs(nowSeconds - Number(timestamp)) > WEBHOOK_TOLERANCE_SECONDS) {
    return false;
  }
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = Buffer.from(createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64"));
  return signature.split(" ").some((entry) => {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) {
      return false;
    }
    const given = Buffer.from(value);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export type SubscriptionEvent = {
  event: string;
  occurredAt: string | null;
  userId: string | null;
  email: string | null;
  subscriptionId: string;
  customerId: string | null;
  productId: string | null;
  // Stored status: Dodo's status, except an active subscription still inside
  // its free trial is recorded as "on_trial".
  status: string;
  trialEndsAt: string | null;
  renewsAt: string | null;
  // When access stops: the period end for a scheduled cancellation, or Dodo's
  // expiry date.
  endsAt: string | null;
};

function text(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function isoOrNull(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

// Only subscription.* events change access; everything else is acknowledged
// and ignored.
export function parseSubscriptionEvent(payload: unknown, now = new Date()): SubscriptionEvent | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const { type, timestamp, data } = payload as { type?: unknown; timestamp?: unknown; data?: Record<string, unknown> };
  const event = text(type);
  if (!event || !event.startsWith("subscription.") || !data || typeof data !== "object") {
    return null;
  }
  const subscriptionId = text(data.subscription_id);
  const rawStatus = text(data.status);
  if (!subscriptionId || !rawStatus) {
    return null;
  }

  const customer = (data.customer ?? {}) as Record<string, unknown>;
  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  const userId = text(metadata.user_id);
  const createdAt = isoOrNull(data.created_at);
  const trialDays = Number(data.trial_period_days ?? 0);
  const trialEndsAt =
    createdAt && Number.isFinite(trialDays) && trialDays > 0
      ? new Date(Date.parse(createdAt) + trialDays * 24 * 60 * 60 * 1000).toISOString()
      : null;
  const renewsAt = isoOrNull(data.next_billing_date);
  const endsAt = data.cancel_at_next_billing_date === true ? renewsAt : isoOrNull(data.expires_at);
  const onTrial = rawStatus === "active" && trialEndsAt !== null && Date.parse(trialEndsAt) > now.getTime();

  return {
    event,
    occurredAt: isoOrNull(timestamp),
    userId: userId && /^[0-9a-f-]{36}$/i.test(userId) ? userId : null,
    email: text(customer.email)?.toLowerCase() ?? null,
    subscriptionId,
    customerId: text(customer.customer_id),
    productId: text(data.product_id),
    status: onTrial ? "on_trial" : rawStatus,
    trialEndsAt,
    renewsAt,
    endsAt,
  };
}
