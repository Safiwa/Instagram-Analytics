import { createHmac, timingSafeEqual } from "node:crypto";
import { isDatabaseConfigured } from "../db/client";
import { isResendConfigured } from "../digest/resend";
import { isConnectSecretConfigured } from "../instagram/crypto";
import { log } from "../logging/logger";
import type { BillingInterval, PaidPlanId } from "./plans";

// Lemon Squeezy is the merchant of record: it takes the card, charges VAT/sales
// tax, runs the 14-day trial and pays out to the owner's bank or PayPal. This
// module only creates hosted checkouts and reads its signed webhooks.

const API = "https://api.lemonsqueezy.com/v1";

export type BillingConfig = {
  apiKey: string;
  storeId: string;
  webhookSecret: string;
  // plan -> interval -> variant id (from Lemon Squeezy > Products > variant).
  variants: Record<PaidPlanId, Partial<Record<BillingInterval, string>>>;
};

function env(name: string): string | null {
  return process.env[name]?.trim() || null;
}

export function billingConfig(): BillingConfig | null {
  const apiKey = env("LEMONSQUEEZY_API_KEY");
  const storeId = env("LEMONSQUEEZY_STORE_ID");
  const webhookSecret = env("LEMONSQUEEZY_WEBHOOK_SECRET");
  if (!apiKey || !storeId || !webhookSecret) {
    return null;
  }
  const variants = {} as BillingConfig["variants"];
  for (const plan of ["starter", "pro", "agency"] as const) {
    const key = plan.toUpperCase();
    variants[plan] = {};
    const monthly = env(`LEMONSQUEEZY_VARIANT_${key}_MONTHLY`);
    const yearly = env(`LEMONSQUEEZY_VARIANT_${key}_YEARLY`);
    if (monthly) variants[plan].monthly = monthly;
    if (yearly) variants[plan].yearly = yearly;
  }
  return { apiKey, storeId, webhookSecret, variants };
}

// Paid plans switch on only when every piece is in place: Lemon Squeezy keys,
// at least one variant, the database (accounts + usage), CONNECT_SECRET (signed
// session cookies) and Resend (sign-in emails). Until then the site keeps
// working exactly as before with no limits.
export function isBillingEnabled(): boolean {
  const config = billingConfig();
  const hasVariant =
    config !== null && Object.values(config.variants).some((intervals) => Object.keys(intervals).length > 0);
  return hasVariant && isDatabaseConfigured() && isConnectSecretConfigured() && isResendConfigured();
}

export function variantFor(config: BillingConfig, plan: PaidPlanId, interval: BillingInterval): string | null {
  return config.variants[plan][interval] ?? null;
}

export function planForVariant(config: BillingConfig, variantId: string | number | null | undefined): PaidPlanId | null {
  if (variantId === null || variantId === undefined) {
    return null;
  }
  const wanted = String(variantId);
  for (const plan of ["starter", "pro", "agency"] as const) {
    if (Object.values(config.variants[plan]).includes(wanted)) {
      return plan;
    }
  }
  return null;
}

export async function createCheckout(
  config: BillingConfig,
  input: { variantId: string; email: string; userId: string; redirectUrl: string },
): Promise<string> {
  const response = await fetch(`${API}/checkouts`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: { email: input.email, custom: { user_id: input.userId } },
          product_options: { redirect_url: input.redirectUrl },
        },
        relationships: {
          store: { data: { type: "stores", id: config.storeId } },
          variant: { data: { type: "variants", id: input.variantId } },
        },
      },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    log.error("lemon squeezy checkout rejected", { status: response.status });
    throw new Error(`Lemon Squeezy rejected the checkout with status ${response.status}.`);
  }
  const body = (await response.json()) as { data?: { attributes?: { url?: unknown } } };
  const url = body.data?.attributes?.url;
  if (typeof url !== "string" || !url.startsWith("https://")) {
    throw new Error("Lemon Squeezy returned no checkout URL.");
  }
  return url;
}

// X-Signature is the hex HMAC-SHA256 of the raw request body, keyed with the
// webhook signing secret set in Lemon Squeezy > Settings > Webhooks.
export function verifyWebhookSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) {
    return false;
  }
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"), "utf8");
  const given = Buffer.from(signature.trim(), "utf8");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export type SubscriptionEvent = {
  event: string;
  userId: string | null;
  email: string | null;
  subscriptionId: string;
  customerId: string | null;
  variantId: string | null;
  status: string;
  trialEndsAt: string | null;
  renewsAt: string | null;
  endsAt: string | null;
  customerPortalUrl: string | null;
};

function text(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

// Only subscription_* events change access; everything else is acknowledged
// and ignored.
export function parseSubscriptionEvent(payload: unknown): SubscriptionEvent | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const { meta, data } = payload as {
    meta?: { event_name?: unknown; custom_data?: { user_id?: unknown } };
    data?: { type?: unknown; id?: unknown; attributes?: Record<string, unknown> };
  };
  const event = text(meta?.event_name);
  if (!event || !event.startsWith("subscription_") || data?.type !== "subscriptions") {
    return null;
  }
  const attributes = data.attributes ?? {};
  const subscriptionId = text(data.id);
  const status = text(attributes.status);
  if (!subscriptionId || !status) {
    return null;
  }
  const urls = (attributes.urls ?? {}) as Record<string, unknown>;
  const userId = text(meta?.custom_data?.user_id);
  return {
    event,
    userId: userId && /^[0-9a-f-]{36}$/i.test(userId) ? userId : null,
    email: text(attributes.user_email)?.toLowerCase() ?? null,
    subscriptionId,
    customerId: text(attributes.customer_id),
    variantId: text(attributes.variant_id),
    status,
    trialEndsAt: text(attributes.trial_ends_at),
    renewsAt: text(attributes.renews_at),
    endsAt: text(attributes.ends_at),
    customerPortalUrl: text(urls.customer_portal),
  };
}
