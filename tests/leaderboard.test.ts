import { describe, expect, it } from "vitest";
import { modashBenchmark } from "../src/core/analytics/benchmark";
import { rankProfiles, TRENDING_WINDOW_DAYS } from "../src/core/data/leaderboard";
import type { CreatorProfile, Post } from "../src/core/data/types";

const NOW = new Date("2026-11-21T12:00:00.000Z");

function post(id: string, daysAgo: number, likes: number, comments = 0): Post {
  return {
    id,
    type: "Reel",
    caption: "",
    postedAt: new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    likes,
    comments,
    hashtags: [],
  };
}

function profile(username: string, followers: number, posts: Post[]): CreatorProfile {
  return {
    username,
    displayName: username,
    category: "Instagram Professional",
    bio: "",
    followers,
    following: 100,
    postsCount: posts.length,
    isVerified: false,
    source: "live",
    followerHistory: [],
    recentPosts: posts,
  };
}

describe("global leaderboard ranking", () => {
  it("ranks trending by engagement within the 15-day window", () => {
    const board = rankProfiles(
      [
        profile("hot", 1_000_000, [post("a", 2, 20_000), post("b", 4, 18_000)]),
        profile("warm", 1_000_000, [post("c", 3, 5_000), post("d", 5, 5_000)]),
      ],
      NOW,
    );

    expect(board.windowDays).toBe(TRENDING_WINDOW_DAYS);
    expect(board.trending.map((entry) => entry.username)).toEqual(["hot", "warm"]);
    expect(board.trending[0].postsInWindow).toBe(2);
    expect(board.trending[0].windowRate).toBe(1.9);
    expect(board.trending[1].windowRate).toBe(0.5);
  });

  it("excludes profiles with no posts in the window from trending but keeps them in engagement", () => {
    const stale = profile("stale", 1_000_000, [post("old", 40, 100_000)]);
    const fresh = profile("fresh", 1_000_000, [post("new", 1, 4_000)]);
    const board = rankProfiles([stale, fresh], NOW);

    expect(board.trending.map((entry) => entry.username)).toEqual(["fresh"]);
    expect(board.engaged.map((entry) => entry.username)).toEqual(["stale", "fresh"]);
    expect(board.engaged[0].engagementRate).toBe(10);
  });

  it("caps both lists at ten entries and skips profiles without posts or followers", () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      profile(`creator${index}`, 100_000, [post(`p${index}`, 1, 1_000 + index)]),
    );
    many.push(profile("empty", 100_000, []));
    many.push(profile("zero", 0, [post("z", 1, 100)]));

    const board = rankProfiles(many, NOW);
    expect(board.tracked).toBe(12);
    expect(board.trending).toHaveLength(10);
    expect(board.engaged).toHaveLength(10);
  });
});

describe("Modash benchmark tiers", () => {
  it("maps follower counts to the published audience tiers", () => {
    expect(modashBenchmark(500)).toBeNull();
    expect(modashBenchmark(5_000)?.label).toBe("Nano");
    expect(modashBenchmark(50_000)?.label).toBe("Micro");
    expect(modashBenchmark(500_000)?.label).toBe("Macro");
    expect(modashBenchmark(50_000_000)?.label).toBe("Mega");
    expect(modashBenchmark(1_000_000)?.range).toBe("0.5-2%");
  });
});
