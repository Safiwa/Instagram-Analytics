import { fetchFollowerSignals, type FollowerSignals } from "../data/public";
import { listPendingChecks, recordCheck } from "../db/followerChecks";
import { log } from "../logging/logger";

export type FollowerCheckResult = { attempted: number; checked: number; failed: number };

// Reads pending followers' public profiles within a time budget. Runs right
// after an upload and in the daily collector, so large lists finish over a few
// runs and temporary failures (e.g. the public bridge being offline) retry.
export async function runFollowerChecks(options: {
  budgetMs: number;
  accountId?: string;
  limit?: number;
  concurrency?: number;
  now?: () => number;
  fetchSignals?: (username: string) => Promise<FollowerSignals | "not_found" | null>;
}): Promise<FollowerCheckResult> {
  const now = options.now ?? Date.now;
  const started = now();
  const fetchSignals = options.fetchSignals ?? fetchFollowerSignals;
  const pending = await listPendingChecks(options.limit ?? 120, options.accountId);
  let next = 0;
  let checked = 0;
  let failed = 0;

  async function worker(): Promise<void> {
    while (next < pending.length && now() - started < options.budgetMs) {
      const check = pending[next];
      next += 1;
      let result: FollowerSignals | "not_found" | null = null;
      try {
        result = await fetchSignals(check.username);
      } catch {
        result = null;
      }
      await recordCheck(check, result);
      if (result && result !== "not_found") {
        checked += 1;
      } else {
        failed += 1;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, options.concurrency ?? 3), pending.length) }, () => worker()),
  );
  const result = { attempted: next, checked, failed };
  if (next > 0) {
    log.info("follower checks run", result);
  }
  return result;
}
