import { isSubscriptionStoreConfigured, saveSubscription } from "../../../../core/digest/subscriptions";
import { trialEndsAt, validateSignup } from "../../../../core/digest/validation";
import { log } from "../../../../core/logging/logger";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const validated = validateSignup(body as Record<string, unknown>);
  if (!validated.ok) {
    return Response.json({ error: validated.message }, { status: 400 });
  }

  if (!isSubscriptionStoreConfigured()) {
    return Response.json({ error: "Subscriptions are not configured." }, { status: 503 });
  }

  const now = new Date();
  try {
    const result = await saveSubscription({
      email: validated.value.email,
      handle: validated.value.handle,
      createdAt: now.toISOString(),
      trialEndsAt: trialEndsAt(now),
      status: "trial",
    });

    log.info("weekly digest signup", {
      handle: validated.value.handle,
      result,
    });

    return Response.json(
      {
        ok: true,
        message:
          result === "created"
            ? "You're on the list. Your free 30-day weekly digest starts here."
            : "You're already subscribed to this profile's weekly digest.",
      },
      { status: result === "created" ? 201 : 200 },
    );
  } catch (error) {
    log.error("weekly digest signup failed", {
      handle: validated.value.handle,
      message: error instanceof Error ? error.message : "unknown",
    });
    return Response.json(
      { error: "Could not save your subscription. Please try again." },
      { status: 500 },
    );
  }
}
