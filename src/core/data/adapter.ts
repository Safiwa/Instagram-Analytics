import { log } from "../logging/logger";
import { fetchLiveProfile, isLiveConfigured, LiveProfileError } from "./live";
import { fetchPublicProfile, PublicProfileError } from "./public";
import { seedProfiles } from "./seed";
import type { CreatorProfile } from "./types";

const MAX_COMPARE_HANDLES = 4;

export type ProfileResolution =
  | { status: "found"; profile: CreatorProfile }
  | { status: "not_found"; message: string }
  | { status: "error"; message: string };

export function normalizeHandle(input: string): string {
  return input.trim().replace(/^@/, "").toLowerCase();
}

export function listProfiles(): CreatorProfile[] {
  return seedProfiles;
}

export function getProfile(handle: string): CreatorProfile | null {
  const found = findSeedProfile(handle);

  if (!found) {
    log.warn("profile lookup missed", { handle: normalizeHandle(handle) });
  }

  return found;
}

function findSeedProfile(handle: string): CreatorProfile | null {
  const key = normalizeHandle(handle);
  return seedProfiles.find((profile) => profile.username.toLowerCase() === key) ?? null;
}

export function searchProfiles(query: string): CreatorProfile[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return listProfiles();
  }

  return listProfiles().filter((profile) =>
    [profile.username, profile.displayName, profile.category].some((field) =>
      field.toLowerCase().includes(needle),
    ),
  );
}

export async function resolveProfile(handle: string): Promise<ProfileResolution> {
  const key = normalizeHandle(handle);

  if (!key) {
    return { status: "not_found", message: "Enter an Instagram username." };
  }

  // Seeded demos stay offline and deterministic, even if a real account shares the handle.
  const demo = findSeedProfile(key);
  if (demo) {
    return { status: "found", profile: demo };
  }

  if (isLiveConfigured()) {
    try {
      return { status: "found", profile: await fetchLiveProfile(key) };
    } catch (error) {
      const liveFailure = mapLiveFailure(error, key);
      const fallback = await tryPublicProfile(key);
      return fallback ? { status: "found", profile: fallback } : liveFailure;
    }
  }

  try {
    return { status: "found", profile: await fetchPublicProfile(key) };
  } catch (error) {
    return mapPublicFailure(error, key);
  }
}

function mapLiveFailure(error: unknown, key: string): ProfileResolution {
  if (error instanceof LiveProfileError) {
    return {
      status: error.kind === "not_found" ? "not_found" : "error",
      message: error.message,
    };
  }

  log.error("profile resolution failed", {
    handle: key,
    message: error instanceof Error ? error.message : "unknown",
  });
  return { status: "error", message: "Could not load this profile." };
}

function mapPublicFailure(error: unknown, key: string): ProfileResolution {
  if (error instanceof PublicProfileError) {
    return {
      status: error.kind === "not_found" ? "not_found" : "error",
      message: error.message,
    };
  }

  log.error("public profile resolution failed", {
    handle: key,
    message: error instanceof Error ? error.message : "unknown",
  });
  return { status: "error", message: "Could not load this profile." };
}

async function tryPublicProfile(key: string): Promise<CreatorProfile | null> {
  try {
    const profile = await fetchPublicProfile(key);
    log.info("public web fallback succeeded", { handle: key });
    return profile;
  } catch (error) {
    log.warn("public web fallback failed", {
      handle: key,
      message: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

export function parseHandles(
  raw: string | string[] | null | undefined,
): { handles: string[]; truncated: boolean } {
  if (!raw) {
    return { handles: [], truncated: false };
  }

  const joined = Array.isArray(raw) ? raw.join(",") : raw;
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const part of joined.split(",")) {
    const handle = normalizeHandle(part);
    if (handle && !seen.has(handle)) {
      seen.add(handle);
      unique.push(handle);
    }
  }

  const truncated = unique.length > MAX_COMPARE_HANDLES;
  if (truncated) {
    log.warn("comparison handle limit applied", { requested: unique.length, kept: MAX_COMPARE_HANDLES });
  }

  return { handles: unique.slice(0, MAX_COMPARE_HANDLES), truncated };
}

export { isLiveConfigured };
