import { resolveProfile } from "../../../core/data/adapter";
import { LEADERBOARD_HANDLES, UAE_GCC_HANDLES } from "../../../core/data/leaderboard";
import { isDatabaseConfigured } from "../../../core/db/client";
import { runCollector } from "../../../core/db/collector";
import { syncDueConnectedAccounts } from "../../../core/instagram/sync";
import { log } from "../../../core/logging/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

// Daily Vercel Cron job (see vercel.json). Stores one snapshot per tracked or
// recently searched profile, building the in-house follower/engagement history.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return Response.json({ error: "The daily collector is not enabled." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return Response.json({ error: "DATABASE_URL is not configured." }, { status: 503 });
  }

  try {
    const result = await runCollector({
      trackedHandles: [...LEADERBOARD_HANDLES, ...UAE_GCC_HANDLES],
      resolve: resolveProfile,
      budgetMs: 35_000,
    });
    // Connected creators: refresh tokens when due and store today's insights.
    const connected = await syncDueConnectedAccounts({ budgetMs: 12_000 });
    return Response.json({ ok: true, ...result, connected });
  } catch (error) {
    log.error("daily collector failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return Response.json({ error: "Collector run failed." }, { status: 500 });
  }
}
