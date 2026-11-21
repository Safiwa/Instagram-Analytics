import { describe, expect, it } from "vitest";
import {
  CREATOR_CATEGORIES,
  categoryGroup,
  inferCategory,
  isSimilarCategory,
} from "../src/core/analytics/category";
import { computeMetrics } from "../src/core/analytics/metrics";
import { buildPeerRanking, findClosestPeer } from "../src/core/analytics/peer";
import { buildRegionalRanking, findRegionalCategoryPeer } from "../src/core/analytics/regional";
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

function profile(
  displayName: string,
  bio: string,
  likes = 1_000,
  username = displayName.toLowerCase().replace(/[^a-z0-9]/g, ""),
): CreatorProfile {
  return {
    username,
    displayName,
    category: "Instagram Professional",
    bio,
    followers: 60_000,
    following: 100,
    postsCount: 20,
    isVerified: false,
    source: "live",
    followerHistory: [],
    recentPosts: [post(likes), post(likes)],
  };
}

describe("inferCategory", () => {
  it("maps creator biographies to the Instagram-style creator categories", () => {
    expect(inferCategory(profile("Nora Styles", "Beauty skin-first routines and product reviews"))).toBe(
      "Beauty, cosmetic & personal care",
    );
    expect(inferCategory(profile("Ola Al Qodmani", "Travel creator, 40+ countries"))).toBe(
      "Travel blogger",
    );
    expect(inferCategory(profile("Foodie Daily", "Food blogger and chef in Dubai"))).toBe(
      "Food blogger",
    );
    expect(inferCategory(profile("Fit Life", "Fitness model and gym training"))).toBe(
      "Fitness model",
    );
    expect(inferCategory(profile("Reel Maker", "Reel creator and video creator"))).toBe(
      "Reel/Video creator",
    );
    expect(inferCategory(profile("My Diary", "Personal blog about my life"))).toBe("Personal blog");
    expect(inferCategory(profile("Daily Posts", "Content creator sharing more"))).toBe(
      "Content creator",
    );
  });

  it("keeps brands, media and tourism accounts out of the creator categories", () => {
    expect(inferCategory(profile("Emirates", "Fly Better airline"))).toBe("Travel & tourism");
    expect(inferCategory(profile("Gulf News", "The no.1 news brand in the UAE"))).toBe(
      "News & media",
    );
    expect(inferCategory(profile("Dubai Mall", "Shopping mall and retail"))).toBe(
      "Business & brand",
    );
  });

  it("does not treat the 'mall' in a small handle as a business category", () => {
    expect(inferCategory(profile("small.uae", "Food blogger in Abu Dhabi"))).toBe("Food blogger");
  });

  it("falls back to Public figure for a person's name and Digital creator otherwise", () => {
    expect(inferCategory(profile("Taylor Swift", "No biography provided"))).toBe("Public figure");
    expect(inferCategory(profile("dailyvibes", ""))).toBe("Digital creator");
  });
});

describe("categoryGroup and isSimilarCategory", () => {
  it("treats every listed creator category as mutually comparable", () => {
    for (const category of CREATOR_CATEGORIES) {
      expect(categoryGroup(category)).toBe("creator");
    }
    expect(isSimilarCategory("Food blogger", "Beauty, cosmetic & personal care")).toBe(true);
    expect(isSimilarCategory("Travel blogger", "Public figure")).toBe(true);
  });

  it("isolates business, media, tourism, sport and music accounts", () => {
    expect(categoryGroup("News & media")).toBe("media");
    expect(categoryGroup("Travel & tourism")).toBe("travel-business");
    expect(categoryGroup("Business & brand")).toBe("business");
    expect(isSimilarCategory("Digital creator", "Business & brand")).toBe(false);
    expect(isSimilarCategory("Beauty, cosmetic & personal care", "News & media")).toBe(false);
    expect(isSimilarCategory("Travel & tourism", "Travel blogger")).toBe(false);
    expect(isSimilarCategory("Sport", "Music")).toBe(false);
  });

  it("always treats an exact category as similar, including unknown labels", () => {
    expect(isSimilarCategory("Something custom", "Something custom")).toBe(true);
  });
});

describe("benchmark filtering by category", () => {
  const creator = profile("creators.style", "Beauty and skincare routines", 2_000);
  const creatorPeer = profile("peer.beauty", "Beauty and makeup reviews", 2_100, "peerbeauty");
  const airline = profile("Emirates", "Fly Better airline", 5_000, "emirates");
  const news = profile("Gulf News", "The no.1 news brand in the UAE", 4_000, "gulfnews");
  const media = [creatorPeer, airline, news];

  it("never benchmarks a creator against a business or media account", () => {
    const match = findClosestPeer(creator, computeMetrics(creator), media);
    expect(match?.profile.username).toBe("peerbeauty");
    expect(match?.category).toBe("Beauty, cosmetic & personal care");

    const ranking = buildPeerRanking(creator, computeMetrics(creator), [creator, ...media]);
    expect(ranking?.rows.map((row) => row.profile.username)).not.toContain("emirates");
    expect(ranking?.rows.map((row) => row.profile.username)).not.toContain("gulfnews");
    expect(ranking?.rows.every((row) => row.category !== "News & media")).toBe(true);
  });

  it("keeps a business account inside its own category group", () => {
    const mall = profile("Dubai Mall", "Shopping mall and retail", 5_000, "dubaimall");
    const pool = [mall, creator, creatorPeer];

    expect(findClosestPeer(mall, computeMetrics(mall), pool)).toBeNull();
    expect(buildRegionalRanking(mall, computeMetrics(mall), pool)).toBeNull();
  });

  it("applies the same category filter to the regional benchmark", () => {
    const match = findRegionalCategoryPeer(creator, computeMetrics(creator), media);
    expect(match?.profile.username).toBe("peerbeauty");

    const ranking = buildRegionalRanking(creator, computeMetrics(creator), [creator, ...media]);
    expect(ranking?.rows.some((row) => row.profile.username === "emirates")).toBe(false);
    expect(ranking?.rows.some((row) => row.profile.username === "gulfnews")).toBe(false);
  });
});
