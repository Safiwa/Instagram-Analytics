import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { log } from "../logging/logger";

export type DigestSubscription = {
  email: string;
  handle: string;
  createdAt: string;
  trialEndsAt: string;
  status: "trial";
  lastSentAt?: string;
};

type KvConfig = {
  accountId: string;
  namespaceId: string;
  token: string;
};

type SaveResult = "created" | "existing";

const KEY_PREFIX = "digest:sub:";
const WEEKLY_INTERVAL_MS = 6 * 24 * 60 * 60 * 1000;
let localWriteQueue: Promise<unknown> = Promise.resolve();

function kvConfig(): KvConfig | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const namespaceId = process.env.DIGEST_KV_NAMESPACE_ID?.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();

  if (!accountId || !namespaceId || !token) {
    return null;
  }

  return { accountId, namespaceId, token };
}

function keyFor(email: string, handle: string): string {
  const hash = createHash("sha256").update(`${email}:${handle}`).digest("hex");
  return `${KEY_PREFIX}${hash}`;
}

async function kvRequest(config: KvConfig, resource: string, init: RequestInit = {}): Promise<Response> {
  const base = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/storage/kv/namespaces/${config.namespaceId}`;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${config.token}`);

  return fetch(`${base}${resource}`, {
    ...init,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
}

async function kvGet(config: KvConfig, key: string): Promise<DigestSubscription | null> {
  const response = await kvRequest(config, `/values/${encodeURIComponent(key)}`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`KV read failed with ${response.status}`);
  }

  const value = (await response.json()) as Partial<DigestSubscription>;
  if (!value.email || !value.handle || !value.trialEndsAt) {
    return null;
  }
  return value as DigestSubscription;
}

async function kvPut(config: KvConfig, key: string, value: DigestSubscription): Promise<void> {
  const response = await kvRequest(config, `/values/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  if (!response.ok) {
    throw new Error(`KV write failed with ${response.status}`);
  }
}

function localPath(): string {
  return process.env.DIGEST_STORE_PATH?.trim() || path.join(process.cwd(), ".data", "digest-subscriptions.json");
}

async function readLocal(): Promise<DigestSubscription[]> {
  try {
    const raw = await readFile(/*turbopackIgnore: true*/ localPath(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DigestSubscription[]) : [];
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

function isDue(subscription: DigestSubscription, now: Date): boolean {
  if (subscription.status !== "trial") {
    return false;
  }
  if (new Date(subscription.trialEndsAt).getTime() <= now.getTime()) {
    return false;
  }
  if (!subscription.lastSentAt) {
    return true;
  }
  return now.getTime() - new Date(subscription.lastSentAt).getTime() >= WEEKLY_INTERVAL_MS;
}

export async function saveSubscription(subscription: DigestSubscription): Promise<SaveResult> {
  const key = keyFor(subscription.email, subscription.handle);
  const config = kvConfig();

  if (config) {
    const existing = await kvGet(config, key);
    if (existing) {
      return "existing";
    }
    await kvPut(config, key, subscription);
    log.info("weekly digest subscription stored", { handle: subscription.handle, store: "kv", result: "created" });
    return "created";
  }

  return withLocalLock(async () => {
    const values = await readLocal();
    if (values.some((item) => item.email === subscription.email && item.handle === subscription.handle)) {
      return "existing";
    }
    await writeLocal([...values, subscription]);
    log.info("weekly digest subscription stored", { handle: subscription.handle, store: "local", result: "created" });
    return "created";
  });
}

export async function listDueSubscriptions(now = new Date()): Promise<DigestSubscription[]> {
  const config = kvConfig();

  if (config) {
    const response = await kvRequest(config, `/keys?prefix=${encodeURIComponent(KEY_PREFIX)}&limit=1000`);
    if (!response.ok) {
      throw new Error(`KV list failed with ${response.status}`);
    }
    const payload = (await response.json()) as { result?: { name: string }[] };
    const keys = payload.result?.map((item) => item.name) ?? [];
    const values = await Promise.all(keys.map((key) => kvGet(config, key)));
    return values
      .filter((item): item is DigestSubscription => Boolean(item))
      .filter((item) => isDue(item, now))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  const values = await readLocal();
  return values.filter((item) => isDue(item, now)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function markSent(subscription: DigestSubscription, sentAt: string): Promise<void> {
  const updated: DigestSubscription = { ...subscription, lastSentAt: sentAt };
  const key = keyFor(subscription.email, subscription.handle);
  const config = kvConfig();

  if (config) {
    await kvPut(config, key, updated);
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
