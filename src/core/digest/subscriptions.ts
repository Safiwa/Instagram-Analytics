import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { log } from "../logging/logger";

export type DigestSubscription = {
  email: string;
  handle: string;
  createdAt: string;
  trialEndsAt: string;
  lastSentAt?: string;
  lastFollowers?: number;
  lastEngagementRate?: number;
};

export type DigestSnapshot = {
  sentAt: string;
  followers: number;
  engagementRate: number;
};

type RedisConfig = {
  url: string;
  token: string;
};

type SaveResult = "created" | "existing";

const KEY_PREFIX = "digest:sub:";
const WEEKLY_INTERVAL_MS = 6 * 24 * 60 * 60 * 1000;
let localWriteQueue: Promise<unknown> = Promise.resolve();

function redisConfig(): RedisConfig | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim().replace(/\/+$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return url && token ? { url, token } : null;
}

export function isSubscriptionStoreConfigured(): boolean {
  return redisConfig() !== null || !process.env.VERCEL;
}

function keyFor(email: string, handle: string): string {
  const hash = createHash("sha256").update(`${email}:${handle}`).digest("hex");
  return `${KEY_PREFIX}${hash}`;
}

async function redisCommand(config: RedisConfig, command: (string | number)[]): Promise<unknown> {
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Upstash command failed with ${response.status}`);
  }

  const payload = (await response.json()) as { result?: unknown; error?: string };
  if (payload.error) {
    throw new Error(payload.error);
  }
  return payload.result;
}

function parseSubscription(value: unknown): DigestSubscription | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const item = value as Partial<DigestSubscription>;
  if (!item.email || !item.handle || !item.createdAt) {
    return null;
  }
  return item as DigestSubscription;
}

function localPath(): string {
  return (
    process.env.DIGEST_STORE_PATH?.trim() ||
    path.join(process.cwd(), ".data", "digest-subscriptions.json")
  );
}

async function readLocal(): Promise<DigestSubscription[]> {
  try {
    const raw = await readFile(/*turbopackIgnore: true*/ localPath(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(parseSubscription).filter((item): item is DigestSubscription => Boolean(item));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeLocal(values: DigestSubscription[]): Promise<void> {
  const target = localPath();
  await mkdir(/*turbopackIgnore: true*/ path.dirname(target), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ target, `${JSON.stringify(values, null, 2)}\n`, "utf8");
}

function withLocalLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = localWriteQueue.then(operation, operation);
  localWriteQueue = result.catch(() => undefined);
  return result;
}

export function isSubscriptionDue(subscription: DigestSubscription, now: Date): boolean {
  if (!subscription.lastSentAt) {
    return true;
  }
  return now.getTime() - new Date(subscription.lastSentAt).getTime() >= WEEKLY_INTERVAL_MS;
}

export async function saveSubscription(subscription: DigestSubscription): Promise<SaveResult> {
  const key = keyFor(subscription.email, subscription.handle);
  const config = redisConfig();

  if (config) {
    const result = await redisCommand(config, ["SET", key, JSON.stringify(subscription), "NX"]);
    const created = result === "OK";
    log.info("weekly digest subscription stored", {
      handle: subscription.handle,
      store: "upstash",
      result: created ? "created" : "existing",
    });
    return created ? "created" : "existing";
  }

  return withLocalLock(async () => {
    const values = await readLocal();
    if (
      values.some(
        (item) => item.email === subscription.email && item.handle === subscription.handle,
      )
    ) {
      return "existing";
    }
    await writeLocal([...values, subscription]);
    log.info("weekly digest subscription stored", {
      handle: subscription.handle,
      store: "local",
      result: "created",
    });
    return "created";
  });
}

export async function listDueSubscriptions(now = new Date()): Promise<DigestSubscription[]> {
  const config = redisConfig();

  if (config) {
    const result = await redisCommand(config, ["KEYS", `${KEY_PREFIX}*`]);
    const keys = Array.isArray(result)
      ? result.filter((key): key is string => typeof key === "string")
      : [];
    if (keys.length === 0) {
      return [];
    }
    const values = await Promise.all(
      keys
        .slice(0, 1000)
        .map(async (key) => parseSubscription(await redisCommand(config, ["GET", key]))),
    );
    return values
      .filter((item): item is DigestSubscription => Boolean(item))
      .filter((item) => isSubscriptionDue(item, now))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  const values = await readLocal();
  return values
    .filter((item) => isSubscriptionDue(item, now))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function markSent(
  subscription: DigestSubscription,
  snapshot: DigestSnapshot,
): Promise<void> {
  const updated: DigestSubscription = {
    ...subscription,
    lastSentAt: snapshot.sentAt,
    lastFollowers: snapshot.followers,
    lastEngagementRate: snapshot.engagementRate,
  };
  const key = keyFor(subscription.email, subscription.handle);
  const config = redisConfig();

  if (config) {
    await redisCommand(config, ["SET", key, JSON.stringify(updated)]);
    return;
  }

  await withLocalLock(async () => {
    const values = await readLocal();
    const next = values.map((item) =>
      item.email === subscription.email && item.handle === subscription.handle ? updated : item,
    );
    await writeLocal(next);
  });
}

export async function deleteSubscription(email: string, handle: string): Promise<void> {
  const key = keyFor(email, handle);
  const config = redisConfig();

  if (config) {
    await redisCommand(config, ["DEL", key]);
    return;
  }

  await withLocalLock(async () => {
    const values = await readLocal();
    await writeLocal(values.filter((item) => item.email !== email || item.handle !== handle));
  });
}
