import { describe, expect, it, vi } from "vitest";
import {
  hasPublishedCountryEvidence,
  inferCountrySignal,
} from "../src/core/analytics/country";
import { getRegionalProfiles } from "../src/core/data/regional";
import {
  REGIONAL_PEER_SNAPSHOT_DATE,
  REGIONAL_PEER_SNAPSHOTS,
} from "../src/core/data/regional-peer-snapshots";

const mocks = vi.hoisted(() => ({
  getTrackedProfiles: vi.fn(async () => [] as Awaited<
    ReturnType<typeof import("../src/core/data/leaderboard")["getTrackedProfiles"]>
  >),
}));

vi.mock("../src/core/data/leaderboard", () => ({ getTrackedProfiles: mocks.getTrackedProfiles }));

describe("real regional peer fallback", () => {
  it("captures real public profiles without credentials", () => {
    expect(REGIONAL_PEER_SNAPSHOT_DATE).toBe("2026-11-23");
    expect(REGIONAL_PEER_SNAPSHOTS.map((profile) => profile.username)).toEqual([
      "khalus_recipes",
      "ladyandhersweetescapes",
      "airagymn",
      "raw.lebanon",
    ]);
    expect(
      REGIONAL_PEER_SNAPSHOTS.every(
        (profile) => profile.source === "public" && !profile.isPrivate,
      ),
    ).toBe(true);

    const lebanon = REGIONAL_PEER_SNAPSHOTS.find(
      (profile) => profile.username === "raw.lebanon",
    )!;
    const lebanonSignal = inferCountrySignal(lebanon);
    expect(lebanonSignal.country).toBe("Lebanon");
    expect(lebanonSignal.basis).toBe("posts");
    expect(hasPublishedCountryEvidence(lebanonSignal)).toBe(true);
    expect(lebanon.followers).toBe(55_079);
    expect(lebanon.following).toBe(155);
    expect(lebanon.postsCount).toBe(125);
    expect(lebanon.isVerified).toBe(true);
    expect(JSON.stringify(REGIONAL_PEER_SNAPSHOTS)).not.toMatch(
      /x-recaptcha|recaptcha.token|authorization|api[_-]?key|proxy_secret|cookie|bearer |process\.env/i,
    );
  });

  it("fills the Middle East panel when the tracked snapshot has not refreshed yet", async () => {
    mocks.getTrackedProfiles.mockResolvedValueOnce([]);

    const profiles = await getRegionalProfiles();
    const usernames = profiles.map((profile) => profile.username);

    expect(usernames).toEqual(
      expect.arrayContaining([
        "khalus_recipes",
        "ladyandhersweetescapes",
        "airagymn",
        "raw.lebanon",
      ]),
    );
  });

  it("never overrides a freshly tracked profile", async () => {
    const fresh = {
      ...REGIONAL_PEER_SNAPSHOTS[0],
      followers: 99_999,
    };
    mocks.getTrackedProfiles.mockResolvedValueOnce([fresh]);

    const profiles = await getRegionalProfiles();
    const khalus = profiles.find((profile) => profile.username === "khalus_recipes");

    expect(khalus?.followers).toBe(99_999);
  });
});
