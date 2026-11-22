import { describe, expect, it } from "vitest";
import { buildCompareRanking } from "../src/core/analytics/compare";
import type { CreatorProfile, Post } from "../src/core/data/types";

function post(likes: number): Post {
  return {
    id: `p-${likes}`,
    type: "Reel",
    caption: "",
    postedAt: new Date("2026-11-20T00:00:00.000Z").toISOString(),
    likes,
    comments: 50,
    hashtags: [],
  };
}

function profile(username: string, displayName: string, bio: string, followers: number): CreatorProfile {
  return {
    username,
    displayName,
    category: "Instagram Professional",
    bio,
    followers,
    following: 100,
    postsCount: 20,
    isVerified: false,
    source: "live",
    followerHistory: [],
    recentPosts: [post(Math.round(followers * 0.03)), post(Math.round(followers * 0.03))],
  };
}

const beautyBio = "Beauty creator with makeup, skincare and fashion tips";

describe("compare ranking", () => {
  it("ranks same-country then same-region benchmarks by the weighted signals", () => {
    const target = profile("hudabeauty", "Huda Beauty", beautyBio, 60_000);
    const highSameCountry = profile("the.matis", "The Mati's", beautyBio, 90_000);
    const lowSameCountry = profile("trending.vibz.uae", "UAE Beauty", beautyBio, 50_000);
    const sameRegion = profile("qatar", "Qatar Beauty", beautyBio, 40_000);
    const excluded = profile("excluded.uae", "Excluded Beauty", beautyBio, 500_000);
    const differentCountry = profile("selenagomez", "Selena Gomez", beautyBio, 150_000);
    const wrongCategory = profile("emirates", "Emirates", "Fly Better airline", 700_000);

    const ranking = buildCompareRanking(target, [
      differentCountry,
      sameRegion,
      excluded,
      target,
      wrongCategory,
      lowSameCountry,
      highSameCountry,
    ], ["@EXCLUDED.UAE"]);

    expect(ranking.map((row) => row.profile.username)).toEqual([
      "the.matis",
      "trending.vibz.uae",
      "qatar",
    ]);
    expect(ranking.map((row) => row.countryRelationship)).toEqual([
      "same-country",
      "same-country",
      "same-region",
    ]);
    expect(ranking.every((row) => row.country.label !== "Country not published")).toBe(true);
    const scores = ranking.map((row) => row.rankScore);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(ranking.every((row) => typeof row.avgLikes === "number")).toBe(true);
    expect(ranking.every((row) => typeof row.avgComments === "number")).toBe(true);
    expect(ranking.every((row) => typeof row.followerChangePct === "number")).toBe(true);
  });

  it("uses same-region profiles when no same-country benchmark is available", () => {
    const target = profile("hudabeauty", "Huda Beauty", beautyBio, 60_000);
    const sameRegion = profile("qatar", "Qatar Beauty", beautyBio, 45_000);
    const unknownCountry = profile("mystery.style", "Mystery Beauty", beautyBio, 80_000);
    const differentCountry = profile("selenagomez", "Selena Gomez", beautyBio, 100_000);

    expect(
      buildCompareRanking(target, [unknownCountry, differentCountry, sameRegion]).map(
        (row) => row.profile.username,
      ),
    ).toEqual(["qatar"]);
  });

  it("omits already compared handles case-insensitively", () => {
    const target = profile("hudabeauty", "Huda Beauty", beautyBio, 60_000);
    const peer = profile("the.matis", "The Mati's", beautyBio, 90_000);

    expect(
      buildCompareRanking(target, [target, peer], [" @THE.MATIS "]).map(
        (row) => row.profile.username,
      ),
    ).toEqual([]);
  });
});
