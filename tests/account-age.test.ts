import { describe, expect, it } from "vitest";
import { estimateJoinYear, joinDateSimilarity, joinYearLabel } from "../src/core/analytics/accountAge";
import { inferExplicitCategory } from "../src/core/analytics/category";
import { selectFollowerBand } from "../src/core/analytics/rank";
import type { CreatorProfile } from "../src/core/data/types";

describe("estimated join date", () => {
  it("places rising account ids in rising years and labels them as estimates", () => {
    expect(estimateJoinYear("25025320")).toBe(2011);
    expect(estimateJoinYear("49930798557")).toBe(2021);
    expect(joinYearLabel("49930798557")).toBe("Joined ~2021 (est.)");
    expect(estimateJoinYear(undefined)).toBeNull();
    expect(estimateJoinYear("not-a-number")).toBeNull();
  });

  it("scores similarity by years apart and is null without both ids", () => {
    expect(joinDateSimilarity("49930798557", "50100000000")).toBe(75);
    expect(joinDateSimilarity("49930798557", undefined)).toBeNull();
  });
});

describe("follower bands", () => {
  const sizes = [5, 40, 100, 900];
  it("picks the narrowest band with a candidate", () => {
    expect(selectFollowerBand(31, sizes, (n) => n)?.band.step).toBe("close");
    expect(selectFollowerBand(31, [100, 900], (n) => n)?.band.step).toBe("10x");
    expect(selectFollowerBand(31, [900], (n) => n)).toBeNull();
    expect(selectFollowerBand(31, [900], (n) => n, () => true, { allowNearest: true })?.band.step).toBe(
      "nearest",
    );
  });
});

describe("marketing agency category", () => {
  const base: CreatorProfile = {
    username: "x",
    displayName: "Campaign Masters",
    category: "Instagram Professional",
    bio: "Creative & digital analytics-based agency. Built for brands that lead.",
    followers: 31,
    following: 0,
    postsCount: 7,
    isVerified: false,
    source: "live",
    followerHistory: [],
    recentPosts: [],
  };
  it("reads agency bios before the brand and media rules", () => {
    expect(inferExplicitCategory(base)).toBe("Marketing agency");
    expect(inferExplicitCategory({ ...base, bio: "Your social media agency in Riyadh" })).toBe(
      "Marketing agency",
    );
  });
  it("uses Instagram's business category when the bio says nothing", () => {
    expect(
      inferExplicitCategory({ ...base, displayName: "CM", bio: "Hello", category: "Marketing Agency" }),
    ).toBe("Marketing agency");
    expect(inferExplicitCategory({ ...base, displayName: "CM", bio: "Hello" })).toBeNull();
  });
});
