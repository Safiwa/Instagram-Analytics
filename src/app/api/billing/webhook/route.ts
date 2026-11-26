import { applySubscriptionEvent } from "../../../../core/billing/accounts";
import {
  billingConfig,
  parseSubscriptionEvent,
  planForProduct,
  verifyWebhookSignature,
} from "../../../../core/billing/dodo";
import { isDatabaseConfigured } from "../../../../core/db/client";
import { log } from "../../../../core/logging/logger";

export const runtime = "nodejs";

// Dodo Payments > Developer > Webhooks: endpoint
// https://www.instagram-analytics.com/api/billing/webhook with the
// subscription.* events. Its signing secret (whsec_…) goes in
// DODO_PAYMENTS_WEBHOOK_SECRET.
export async function POST(request: Request) {
  const config = billingConfig();
  if (!config || !isDatabaseConfigured()) {
    return Response.json({ error: "Billing is not configured." }, { status: 503 });
  }

  const raw = await request.text();
  const signed = verifyWebhookSignature(
    raw,
    {
      id: request.headers.get("webhook-id"),
      timestamp: request.headers.get("webhook-timestamp"),
      signature: request.headers.get("webhook-signature"),
    },
    config.webhookSecret,
  );
  if (!signed) {
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
  const plan = planForProduct(config, event.productId);
  if (!plan) {
    log.warn("webhook for an unknown product", { product: event.productId ?? "none" });
    return Response.json({ ok: true, ignored: true });
  }

  try {
    const applied = await applySubscriptionEvent(event, plan);
    log.info("subscription webhook applied", { event: event.event, status: event.status, plan, applied: applied ? "yes" : "no" });
    return Response.json({ ok: true });
  } catch (error) {
    log.error("subscription webhook failed", { message: error instanceof Error ? error.message : "unknown" });
    // A non-2xx reply makes Dodo Payments retry the delivery.
    return Response.json({ error: "Could not apply the event." }, { status: 500 });
  }
}
