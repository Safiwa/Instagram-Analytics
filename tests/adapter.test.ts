import { describe, expect, it } from "vitest";
import {
  getProfile,
  listProfiles,
  normalizeHandle,
  parseHandles,
  searchProfiles,
} from "../src/core/data/adapter";

describe("data adapter", () => {
  it("exposes the eight seeded profiles", () => {
    expect(listProfiles()).toHaveLength(8);
  });

  it("normalizes handles from @-prefixed and mixed-case input", () => {
    expect(normalizeHandle(" @Nora.Style ")).toBe("nora.style");
  });

  it("filters by category, handle, or display name", () => {
    expect(searchProfiles("beauty").map((profile) => profile.username)).toEqual(["nora.style"]);
    expect(searchProfiles("LUMEN").map((profile) => profile.username)).toEqual(["lumen.travel"]);
  });

  it("returns the full directory for an empty query", () => {
    expect(searchProfiles("   ")).toHaveLength(8);
  });

  it("returns null instead of throwing for an unknown handle", () => {
    expect(getProfile("does.not.exist")).toBeNull();
  });

  it("dedupes, normalizes, and caps comparison handles at four", () => {
    const parsed = parseHandles(
      "@Nora.Style, nora.style, lumen.travel, gym.aria, crumbs.daily, atlas.frames",
    );

    expect(parsed.handles).toEqual(["nora.style", "lumen.travel", "gym.aria", "crumbs.daily"]);
    expect(parsed.truncated).toBe(true);
  });
});
