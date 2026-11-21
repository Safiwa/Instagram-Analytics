import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readTrackedSnapshot,
  TRACKED_SNAPSHOT_TTL_SECONDS,
  writeTrackedSnapshot,
} from "../src/core/data/tracked-store";
import type { CreatorProfile } from "../src/core/data/types";

const profile: CreatorProfile = {
  username: "natgeo",
  displayName: "National Geographic",
  category: "Photographer",
  bio: "Wildlife and travel",
  followers: 267_000_000,
  following: 100,
  postsCount: 1000,
  isVerified: true,
  source: "live",
  followerHistory: [],
  recentPosts: [],
};

describe("tracked pool snapshot store", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns null when Upstash is not configured", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    expect(await readTrackedSnapshot()).toBeNull();
  });

  it("round-trips the tracked pool through Upstash with a TTL", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");

    const commands: unknown[][] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        const command = JSON.parse(init.body) as unknown[];
        commands.push(command);
        const result = command[0] === "GET" ? JSON.stringify([profile]) : "OK";
        return new Response(JSON.stringify({ result }), { status: 200 });
      }),
    );

    await writeTrackedSnapshot([profile]);
    expect(await readTrackedSnapshot()).toEqual([profile]);
    expect(commands[0]).toEqual([
      "SET",
      "analytics:tracked-pool",
      JSON.stringify([profile]),
      "EX",
      TRACKED_SNAPSHOT_TTL_SECONDS,
    ]);
    expect(commands[1]).toEqual(["GET", "analytics:tracked-pool"]);
  });

  it("rejects a snapshot written for a different handle list", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");

    const store = new Map<string, string>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        const command = JSON.parse(init.body) as string[];
        if (command[0] === "SET") {
          store.set(command[1], command[2]);
        }
        return new Response(JSON.stringify({ result: store.get(command[1]) ?? "OK" }), {
          status: 200,
        });
      }),
    );

    await writeTrackedSnapshot([profile], "handles-v1");
    expect(await readTrackedSnapshot("handles-v1")).toEqual([profile]);
    expect(await readTrackedSnapshot("handles-v2")).toBeNull();
    expect(await readTrackedSnapshot()).toEqual([profile]);
  });

  it("does not overwrite the snapshot with an empty pool", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ result: "OK" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await writeTrackedSnapshot([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
