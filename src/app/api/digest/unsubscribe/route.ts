import { deleteSubscription } from "../../../../core/digest/subscriptions";
import { readUnsubscribeToken } from "../../../../core/digest/tokens";
import { log } from "../../../../core/logging/logger";

export const runtime = "nodejs";

function page(title: string, body: string, status: number): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:Arial,sans-serif;max-width:36rem;margin:4rem auto;padding:0 1rem;color:#0f172a"><h1>${title}</h1><p>${body}</p></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const identity = readUnsubscribeToken(token, secret ?? "");

  if (!identity) {
    return page("Invalid link", "This unsubscribe link is invalid or has expired.", 400);
  }

  try {
    await deleteSubscription(identity.email, identity.handle);
    log.info("weekly digest unsubscribed", { handle: identity.handle });
    return page("Unsubscribed", "You will no longer receive this weekly digest.", 200);
  } catch (error) {
    log.error("weekly digest unsubscribe failed", {
      handle: identity.handle,
      message: error instanceof Error ? error.message : "unknown",
    });
    return page("Could not unsubscribe", "Please try again in a moment.", 500);
  }
}
