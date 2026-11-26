import { applySubscriptionEvent } from "../../../../core/billing/accounts";
import {
  billingConfig,
  parseSubscriptionEvent,
  planForVariant,
  verifyWebhookSignature,
} from "../../../../core/billing/lemonsqueezy";
import { isDatabaseConfigured } from "../../../../core/db/client";
import { log } from "../../../../core/logging/logger";

export const runtime = "nodejs";

// Lemon Squeezy > Settings > Webhooks: URL https://<site>/api/billing/webhook,
// events subscription_created, subscription_updated, subscription_cancelled,
// subscription_resumed, subscription_expired, subscription_paused,
// subscription_unpaused. The same signing secret goes in
// LEMONSQUEEZY_WEBHOOK_SECRET.
export async function POST(request: Request) {
  const config = billingConfig();
  if (!config || !isDatabaseConfigured()) {
    return Response.json({ error: "Billing is not configured." }, { status: 503 });
  }

  const raw = await request.text();
  if (!verifyWebhookSignature(raw, request.headers.get("x-signature"), config.webhookSecret)) {
    log.warn("webhook signature rejected");
    return Response.json({ error: "Invalid signature." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const event = parseSubscriptionEvent(payload);
  if (!event) {
    return Response.json({ ok: true, ignored: true });
  }
  const plan = planForVariant(config, event.variantId);
  if (!plan) {
    log.warn("webhook for an unknown variant", { variant: event.variantId ?? "none" });
    return Response.json({ ok: true, ignored: true });
  }

  try {
    const applied = await applySubscriptionEvent(event, plan);
    log.info("subscription webhook applied", { event: event.event, status: event.status, plan, applied: applied ? "yes" : "no" });
    return Response.json({ ok: true });
  } catch (error) {
    log.error("subscription webhook failed", { message: error instanceof Error ? error.message : "unknown" });
    // 500 makes Lemon Squeezy retry the delivery.
    return Response.json({ error: "Could not apply the event." }, { status: 500 });
  }
}
