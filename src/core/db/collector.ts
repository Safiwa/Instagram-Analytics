import type { ProfileResolution } from "../data/adapter";
import { log } from "../logging/logger";
import { listDueHandles, markTracked, recordProfileSnapshot } from "./snapshots";

export type CollectorResult = {
  due: number;
  stored: number;
  failed: number;
  // Due handles left for the next run because the time budget ran out.
  deferred: number;
};

export type CollectorOptions = {
  trackedHandles: readonly string[];
  resolve: (handle: string) => Promise<ProfileResolution>;
  // Stop starting new lookups after this many ms, leaving room to finish the
  // in-flight ones inside the function's max duration.
  budgetMs?: number;
  batchLimit?: number;
  concurrency?: number;
  now?: () => number;
};

export const COLLECTOR_BUDGET_MS = 40_000;
export const COLLECTOR_BATCH_LIMIT = 60;
export const COLLECTOR_CONCURRENCY = 4;

// One daily pass: make sure every tracked handle exists, then refresh the due
// profiles oldest-snapshot first. Whatever does not fit in the time budget is
// picked up first on the next run, so every profile is reached in rotation.
export async function runCollector(options: CollectorOptions): Promise<CollectorResult> {
  const now = options.now ?? Date.now;
  const started = now();
  const budget = options.budgetMs ?? COLLECTOR_BUDGET_MS;
  const concurrency = Math.max(1, options.concurrency ?? COLLECTOR_CONCURRENCY);

  await markTracked(options.trackedHandles);
  const due = await listDueHandles(options.batchLimit ?? COLLECTOR_BATCH_LIMIT, new Date(started));

  let next = 0;
  let stored = 0;
  let failed = 0;

  async function worker(): Promise<void> {
    while (next < due.length && now() - started < budget) {
      const handle = due[next];
      next += 1;
      try {
        const resolution = await options.resolve(handle);
        if (resolution.status === "found" && (await recordProfileSnapshot(resolution.profile))) {
          stored += 1;
        } else {
          failed += 1;
        }
      } catch (error) {
        failed += 1;
        log.warn("collector lookup failed", {
          handle,
          message: error instanceof Error ? error.message : "unknown",
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, due.length) }, () => worker()));

  const result = { due: due.length, stored, failed, deferred: due.length - next };
  log.info("daily collector finished", result);
  return result;
}
