import { log } from "../logging/logger";
import type { CreatorProfile } from "./types";

// The tracked pool is shared across Vercel serverless instances via Upstash so a
// profile page never has to fire 25 Meta API calls just to find a peer. The
// homepage leaderboard refresh writes the snapshot; profile pages read it.
const SNAPSHOT_KEY = "analytics:tracked-pool";
const SIGNATURE_KEY = "analytics:tracked-pool:handles";
export const TRACKED_SNAPSHOT_TTL_SECONDS = 30 * 60;

type RedisConfig = { url: string; token: string };

function redisConfig(): RedisConfig | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim().replace(/\/+$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return url && token ? { url, token } : null;
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

function isProfile(value: unknown): value is CreatorProfile {
  if (!value || typeof value !== "object") {
    return false;
  }
  const profile = value as Partial<CreatorProfile>;
  return (
    typeof profile.username === "string" &&
    typeof profile.followers === "number" &&
    Array.isArray(profile.recentPosts)
  );
}

async function loadSnapshot(): Promise<CreatorProfile[] | null> {
  const config = redisConfig();
  if (!config) {
    return null;
  }

  try {
    const raw = await redisCommand(config, ["GET", SNAPSHOT_KEY]);
    if (typeof raw !== "string") {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }
    const profiles = parsed.filter(isProfile);
    return profiles.length > 0 ? profiles : null;
  } catch (error) {
    log.warn("tracked snapshot read failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

export async function readTrackedSnapshot(signature?: string): Promise<CreatorProfile[] | null> {
  const config = redisConfig();
  if (!config) {
    return null;
  }

  // A snapshot taken for an older handle list must not be reused after the
  // tracked pool changes; otherwise new region boards would stay empty for the
  // rest of the TTL. Older snapshots have no signature and are rebuilt once.
  if (signature) {
    try {
      const storedSignature = await redisCommand(config, ["GET", SIGNATURE_KEY]);
      if (storedSignature !== signature) {
        return null;
      }
    } catch (error) {
      log.warn("tracked snapshot signature read failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
      return null;
    }
  }

  return loadSnapshot();
}

// Used when rebuilding a changed or rate-limited pool: profiles already in the
// snapshot are kept so only the missing handles need a fresh Meta API call.
export async function readTrackedSnapshotAny(): Promise<CreatorProfile[] | null> {
  return loadSnapshot();
}

export async function writeTrackedSnapshot(
  profiles: CreatorProfile[],
  signature?: string,
  ttlSeconds = TRACKED_SNAPSHOT_TTL_SECONDS,
): Promise<void> {
  if (profiles.length === 0) {
    return;
  }

  const config = redisConfig();
  if (!config) {
    return;
  }

  try {
    await redisCommand(config, ["SET", SNAPSHOT_KEY, JSON.stringify(profiles), "EX", ttlSeconds]);
    if (signature) {
      await redisCommand(config, ["SET", SIGNATURE_KEY, signature, "EX", ttlSeconds]);
    }
    log.info("tracked snapshot stored", { profiles: profiles.length, ttlSeconds });
  } catch (error) {
    log.warn("tracked snapshot write failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}
