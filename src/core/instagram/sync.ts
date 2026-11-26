import {
  listAccountsDueForSync,
  markSynced,
  storeAccountInsights,
  type ConnectedAccountWithToken,
} from "../db/connected";
import { utcDay } from "../db/snapshots";
import { log } from "../logging/logger";
import { fetchAccountMetrics, fetchDemographics, fetchFollowers, InstagramApiError } from "./api";

// Pulls today's insights for one connected Instagram account. The Unified
// Login system-user token does not expire, so there is nothing to refresh; if
// Meta rejects it (creator removed access), the error is recorded and the
// creator is asked to reconnect. Never throws.
export async function syncConnectedAccount(
  account: ConnectedAccountWithToken,
  now = new Date(),
): Promise<boolean> {
  try {
    const [followers, metrics, demographics] = await Promise.all([
      fetchFollowers(account.igUserId, account.accessToken),
      fetchAccountMetrics(account.igUserId, account.accessToken, now),
      fetchDemographics(account.igUserId, account.accessToken),
    ]);
    await storeAccountInsights({
      accountId: account.id,
      day: utcDay(now),
      followers,
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
    const message =
      error instanceof InstagramApiError && error.code === 190
        ? "Access was removed or expired. Please reconnect."
        : error instanceof Error
          ? error.message
          : "unknown";
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
