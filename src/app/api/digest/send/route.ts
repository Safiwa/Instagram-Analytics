import { computeMetrics } from "../../../../core/analytics/metrics";
import { resolveProfile } from "../../../../core/data/adapter";
import { buildDigestEmail } from "../../../../core/digest/email";
import { listDueSubscriptions, markSent } from "../../../../core/digest/subscriptions";
import { isSmtpConfigured, sendDigestEmail } from "../../../../core/digest/smtp";
import { log } from "../../../../core/logging/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return Response.json({ error: "Weekly digest is not enabled." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSmtpConfigured()) {
    return Response.json({ error: "SMTP is not configured." }, { status: 503 });
  }

  const now = new Date();
  let due: Awaited<ReturnType<typeof listDueSubscriptions>>;
  try {
    due = await listDueSubscriptions(now);
  } catch (error) {
    log.error("weekly digest subscription read failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return Response.json({ error: "Could not read subscriptions." }, { status: 500 });
  }

  const profiles = new Map<string, Awaited<ReturnType<typeof resolveProfile>>>();
  let sent = 0;
  let failed = 0;

  for (const subscription of due) {
    try {
      let resolved = profiles.get(subscription.handle);
      if (!resolved) {
        resolved = await resolveProfile(subscription.handle);
        profiles.set(subscription.handle, resolved);
      }

      if (resolved.status !== "found") {
        failed += 1;
        log.warn("weekly digest profile unavailable", {
          handle: subscription.handle,
          status: resolved.status,
        });
        continue;
      }

      const metrics = computeMetrics(resolved.profile);
      const content = buildDigestEmail({
        handle: subscription.handle,
        displayName: resolved.profile.displayName,
        followers: resolved.profile.followers,
        metrics,
        sentAt: now,
      });

      await sendDigestEmail(subscription.email, content.subject, content.text, content.html);
      await markSent(subscription, now.toISOString());
      sent += 1;
    } catch (error) {
      failed += 1;
      log.error("weekly digest send failed", {
        handle: subscription.handle,
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  log.info("weekly digest run complete", { due: due.length, sent, failed });
  return Response.json({ ok: true, due: due.length, sent, failed });
}
