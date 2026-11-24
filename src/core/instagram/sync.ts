import {
  listAccountsDueForSync,
  markSynced,
  storeAccountInsights,
  updateToken,
  type ConnectedAccountWithToken,
} from "../db/connected";
import { utcDay } from "../db/snapshots";
import { log } from "../logging/logger";
import { fetchAccountMetrics, fetchDemographics, fetchMe, refreshLongLived } from "./api";

const DAY_MS = 24 * 60 * 60 * 1000;
// Refresh a week after the last refresh: well inside the 60-day lifetime and
// past Meta's 24-hour minimum, so a few missed runs never let a token lapse.
export const TOKEN_REFRESH_AFTER_DAYS = 7;

// Pulls today's insights for one connected account, refreshing its token first
// when due. Never throws: failures are recorded on the account and logged.
export async function syncConnectedAccount(
  account: ConnectedAccountWithToken,
  now = new Date(),
): Promise<boolean> {
  let token = account.accessToken;
  try {
    const refreshedAt = Date.parse(account.tokenRefreshedAt);
    if (!Number.isFinite(refreshedAt) || now.getTime() - refreshedAt >= TOKEN_REFRESH_AFTER_DAYS * DAY_MS) {
      const refreshed = await refreshLongLived(token, now);
      token = refreshed.accessToken;
      await updateToken(account.id, refreshed.accessToken, refreshed.expiresAt);
    }

    const me = await fetchMe(token);
    const [metrics, demographics] = await Promise.all([
      fetchAccountMetrics(me.userId, token, now),
      fetchDemographics(me.userId, token),
    ]);
    await storeAccountInsights({
      accountId: account.id,
      day: utcDay(now),
      followers: me.followers,
      metrics,
      demographics,
    });
    await markSynced(account.id, null);
    log.info("connected account synced", {
      handle: account.username,
      demographics: Object.keys(demographics).length,
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    await markSynced(account.id, message).catch(() => undefined);
    log.warn("connected account sync failed", { handle: account.username, message });
    return false;
  }
}

export async function syncDueConnectedAccounts(options: {
  budgetMs: number;
  limit?: number;
  now?: () => number;
}): Promise<{ due: number; synced: number; failed: number }> {
  const now = options.now ?? Date.now;
  const started = now();
  const due = await listAccountsDueForSync(options.limit ?? 25, new Date(started));
  let synced = 0;
  let failed = 0;
  for (const account of due) {
    if (now() - started >= options.budgetMs) {
      break;
    }
    if (await syncConnectedAccount(account, new Date(now()))) {
      synced += 1;
    } else {
      failed += 1;
    }
  }
  return { due: due.length, synced, failed };
}
