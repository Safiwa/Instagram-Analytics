import { describe, expect, it } from "vitest";
import { firstPublicPost, joinDateSimilarity, joinedLabel } from "../src/core/analytics/accountAge";
import { inferExplicitCategory } from "../src/core/analytics/category";
import { selectFollowerBand } from "../src/core/analytics/rank";
import type { CreatorProfile } from "../src/core/data/types";

function withPosts(dates: string[], postsCount = dates.length): CreatorProfile {
  return {
    username: "x",
    displayName: "X",
    category: "Instagram Professional",
    bio: "",
    followers: 31,
    following: 0,
    postsCount,
    isVerified: false,
    source: "live",
    followerHistory: [],
    recentPosts: dates.map((postedAt, index) => ({
      id: `p${index}`,
      type: "Reel" as const,
      caption: "",
      postedAt,
      likes: 1,
      comments: 0,
      hashtags: [],
    })),
  };
}

describe("first public post", () => {
  it("is measured only when every published post is visible", () => {
    const young = withPosts(["2026-11-24T00:00:00Z", "2026-11-20T00:00:00Z"]);
    expect(firstPublicPost(young)).toMatchObject({ year: 2026, month: 10 });
    expect(joinedLabel(young)).toBe("First post Nov 2026");
    expect(firstPublicPost(withPosts(["2026-11-24T00:00:00Z"], 500))).toBeNull();
  });

  it("scores closeness in months and is null when either side is unknown", () => {
    const a = withPosts(["2026-11-20T00:00:00Z"]);
    const b = withPosts(["2026-08-01T00:00:00Z"]);
    expect(joinDateSimilarity(a, b)).toBe(88);
    expect(joinDateSimilarity(a, withPosts(["2026-11-20T00:00:00Z"], 900))).toBeNull();
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

describe("creator bios that mention brands", () => {
  it("keeps a food creator with brand collaborations in the creator group", () => {
    const reem: CreatorProfile = {
      username: "reemkurdy",
      displayName: "ريم كردي",
      category: "Instagram Professional",
      bio: "Food Creator | Cooking • Reviews • Lifestyle 📍dubai 🇦🇪 | Brand Collaborations 💌",
      followers: 115_000,
      following: 500,
      postsCount: 900,
      isVerified: true,
      source: "live",
      followerHistory: [],
      recentPosts: [],
    };
    expect(inferExplicitCategory(reem)).toBe("Food blogger");
    expect(inferExplicitCategory({ ...reem, category: "Reel creator" })).toBe("Reel/Video creator");
  });
});
