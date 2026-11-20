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
  lastFollowers?: number;
  lastEngagementRate?: number;
};

export type DigestSendUpdate = {
  sentAt: string;
  followers: number;
  engagementRate: number;
};

type KvConfig = {
  accountId: string;
  namespaceId: string;
  token: string;
};

type WorkerConfig = {
  url: string;
  secret: string;
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

function workerConfig(): WorkerConfig | null {
  const url = process.env.DIGEST_WORKER_URL?.trim().replace(/\/$/, "");
  const secret = process.env.DIGEST_WORKER_SECRET?.trim();
  return url && secret ? { url, secret } : null;
}

function hasRemoteStore(): boolean {
  return Boolean(workerConfig() || kvConfig());
}

export function isSubscriptionStoreConfigured(): boolean {
  return hasRemoteStore() || process.env.VERCEL !== "1";
}

function keyFor(email: string, handle: string): string {
  const hash = createHash("sha256").update(`${email}:${handle}`).digest("hex");
  return `${KEY_PREFIX}${hash}`;
}

function workerHeaders(secret: string): HeadersInit {
  return {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };
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

function isSubscription(value: Partial<DigestSubscription>): value is DigestSubscription {
  return Boolean(value.email && value.handle && value.trialEndsAt);
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
  return isSubscription(value) ? value : null;
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

async function kvDelete(config: KvConfig, key: string): Promise<void> {
  const response = await kvRequest(config, `/values/${encodeURIComponent(key)}`, {
    method: "DELETE",
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`KV delete failed with ${response.status}`);
  }
}

async function remoteGet(key: string): Promise<DigestSubscription | null> {
  const worker = workerConfig();
  if (worker) {
    const url = new URL(worker.url);
    url.searchParams.set("key", key);
    const response = await fetch(url, {
      headers: workerHeaders(worker.secret),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Digest store read failed with ${response.status}`);
    }
    const value = (await response.json()) as Partial<DigestSubscription>;
    return isSubscription(value) ? value : null;
  }

  const config = kvConfig();
  if (!config) {
    throw new Error("No digest store configured.");
  }
  return kvGet(config, key);
}

async function remotePut(key: string, value: DigestSubscription): Promise<void> {
  const worker = workerConfig();
  if (worker) {
    const url = new URL(worker.url);
    url.searchParams.set("key", key);
    const response = await fetch(url, {
      method: "PUT",
      headers: workerHeaders(worker.secret),
      body: JSON.stringify(value),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Digest store write failed with ${response.status}`);
    }
    return;
  }

  const config = kvConfig();
  if (!config) {
    throw new Error("No digest store configured.");
  }
  await kvPut(config, key, value);
}

async function remoteDelete(key: string): Promise<void> {
  const worker = workerConfig();
  if (worker) {
    const url = new URL(worker.url);
    url.searchParams.set("key", key);
    const response = await fetch(url, {
      method: "DELETE",
      headers: workerHeaders(worker.secret),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Digest store delete failed with ${response.status}`);
    }
    return;
  }

  const config = kvConfig();
  if (!config) {
    throw new Error("No digest store configured.");
  }
  await kvDelete(config, key);
}

async function remoteListKeys(): Promise<string[]> {
  const worker = workerConfig();
  if (worker) {
    const url = new URL(`${worker.url}/list`);
    const response = await fetch(url, {
      headers: workerHeaders(worker.secret),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Digest store list failed with ${response.status}`);
    }
    const payload = (await response.json()) as { keys?: string[] };
    return (payload.keys ?? []).filter((key) => key.startsWith(KEY_PREFIX));
  }

  const config = kvConfig();
  if (!config) {
    throw new Error("No digest store configured.");
  }
  const response = await kvRequest(config, `/keys?prefix=${encodeURIComponent(KEY_PREFIX)}&limit=1000`);
  if (!response.ok) {
    throw new Error(`KV list failed with ${response.status}`);
  }
  const payload = (await response.json()) as { result?: { name: string }[] };
  return payload.result?.map((item) => item.name) ?? [];
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

export function isSubscriptionDue(subscription: DigestSubscription, now: Date): boolean {
  if (subscription.status && subscription.status !== "trial") {
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

  if (hasRemoteStore()) {
    const existing = await remoteGet(key);
    if (existing) {
      return "existing";
    }
    await remotePut(key, subscription);
    log.info("weekly digest subscription stored", { handle: subscription.handle, store: "remote", result: "created" });
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
  let values: DigestSubscription[];

  if (hasRemoteStore()) {
    const keys = await remoteListKeys();
    const loaded = await Promise.all(keys.map((key) => remoteGet(key)));
    values = loaded.filter((item): item is DigestSubscription => Boolean(item));
  } else {
    values = await readLocal();
  }

  return values
    .filter((item) => isSubscriptionDue(item, now))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function markSent(subscription: DigestSubscription, update: DigestSendUpdate): Promise<void> {
  const key = keyFor(subscription.email, subscription.handle);
  let source = subscription;

  if (hasRemoteStore()) {
    const current = await remoteGet(key);
    if (current) {
      source = current;
    }
  }

  const updated: DigestSubscription = {
    ...source,
    lastSentAt: update.sentAt,
    lastFollowers: update.followers,
    lastEngagementRate: update.engagementRate,
  };

  if (hasRemoteStore()) {
    await remotePut(key, updated);
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

  if (hasRemoteStore()) {
    await remoteDelete(key);
    return;
  }

  await withLocalLock(async () => {
    const values = await readLocal();
    const next = values.filter((item) => !(item.email === email && item.handle === handle));
    await writeLocal(next);
  });
}
