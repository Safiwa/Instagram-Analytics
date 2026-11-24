import { describe, expect, it } from "vitest";
import {
  isIncompletePool,
  rankProfiles,
  rankScore,
  REFRESH_BATCH,
  refreshBatch,
  TRENDING_WINDOW_DAYS,
} from "../src/core/data/leaderboard";
import {
  isInRegionBoard,
  MIDDLE_EAST_COUNTRIES,
  REGION_BOARDS,
  regionForHandle,
} from "../src/core/data/regions";
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

function profile(
  username: string,
  followers: number,
  posts: Post[],
  bio = "",
): CreatorProfile {
  return {
    username,
    displayName: username,
    category: "Instagram Professional",
    bio,
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

describe("weighted leaderboard ranking", () => {
  it("puts a large account ahead of a small one even with lower engagement", () => {
    const big = profile("big", 10_000_000, [post("a", 2, 100_000), post("b", 4, 100_000)]);
    const small = profile("small", 5_000, [post("c", 2, 400), post("d", 4, 400)]);

    const board = rankProfiles([small, big], NOW);

    expect(board.trending.map((entry) => entry.username)).toEqual(["big", "small"]);
    expect(board.trending[0].rankScore).toBeGreaterThan(board.trending[1].rankScore);
    // High engagement now applies the same weighted signals, followers first.
    expect(board.engaged.map((entry) => entry.username)).toEqual(["big", "small"]);
    expect(board.engaged[0].engagementRate).toBeLessThan(board.engaged[1].engagementRate);
  });

  it("ranks country boards by follower count before the weighted score", () => {
    const big = profile("baneenstars", 10_000_000, [post("a", 2, 100_000)], "📍DUBAI");
    const small = profile("wessamq", 5_000, [post("b", 2, 4_000)], "•Dubai📍");
    const board = rankProfiles([small, big], NOW);

    expect(board.regional.uae.map((entry) => entry.username)).toEqual(["baneenstars", "wessamq"]);
    expect(board.regional.uae[0].followers).toBeGreaterThan(board.regional.uae[1].followers);
  });

  it("does not let a small high-engagement account take a country top-ten slot", () => {
    const larger = profile("visitbahrain", 100_000, [post("a", 2, 1_000)]);
    const viralSmall = profile("visitlebanon", 1_000, [post("b", 2, 50_000)]);
    const board = rankProfiles([viralSmall, larger], NOW);

    expect(board.regional["middle-east"].map((entry) => entry.username)).toEqual([
      "visitbahrain",
      "visitlebanon",
    ]);
    expect(board.regional["middle-east"][1].rankScore).toBeGreaterThan(
      board.regional["middle-east"][0].rankScore,
    );
  });

  it("lets every one of the five signals raise the rank score", () => {
    const base = {
      followers: 1_000_000,
      engagementRate: 1,
      avgLikes: 10_000,
      avgComments: 500,
      followerChangePct: 2,
    };
    const score = rankScore(base);

    expect(rankScore({ ...base, followers: 10_000_000 })).toBeGreaterThan(score);
    expect(rankScore({ ...base, engagementRate: 2 })).toBeGreaterThan(score);
    expect(rankScore({ ...base, avgLikes: 20_000 })).toBeGreaterThan(score);
    expect(rankScore({ ...base, avgComments: 1_000 })).toBeGreaterThan(score);
    expect(rankScore({ ...base, followerChangePct: 8 })).toBeGreaterThan(score);
  });

  it("exposes the measured and estimated signals on each entry", () => {
    const board = rankProfiles([profile("natgeo", 1_000_000, [post("a", 2, 10_000)])], NOW);
    const entry = board.trending[0];

    expect(entry.avgLikes).toBe(10_000);
    expect(entry.avgComments).toBe(0);
    expect(entry.followerChangeEstimated).toBe(true);
    expect(entry.rankScore).toBeGreaterThan(0);
  });
});

describe("incomplete tracked pool detection", () => {
  it("backs off when a meaningful share of handles fail", () => {
    expect(isIncompletePool(55, 0)).toBe(false);
    expect(isIncompletePool(55, 5)).toBe(false);
    expect(isIncompletePool(55, 11)).toBe(true);
    expect(isIncompletePool(25, 25)).toBe(true);
    expect(isIncompletePool(0, 0)).toBe(false);
  });

  it("refreshes only small batches that rotate over every handle", () => {
    const handles = Array.from({ length: 55 }, (_, index) => `h${index}`);
    const batches = [0, 1, 2, 3, 4, 5].map((bucket) =>
      refreshBatch(handles, bucket * 15 * 60 * 1000),
    );

    expect(batches.every((batch) => batch.length <= REFRESH_BATCH)).toBe(true);
    expect(new Set(batches.flat()).size).toBe(handles.length);
  });
});

describe("country leaderboards", () => {
  it("maps tracked handles to exactly one of the four country boards", () => {
    expect(regionForHandle("taylorswift")).toBe("usa");
    expect(regionForHandle("davidguetta")).toBe("europe");
    expect(regionForHandle("aljazeera")).toBe("middle-east");
    expect(regionForHandle("emirates")).toBe("uae");
    expect(regionForHandle("jexmi")).toBe("uae");
    expect(regionForHandle("donya_esmailiii")).toBe("uae");
    expect(regionForHandle("dina_h_ussien")).toBe("uae");
    expect(regionForHandle("taranum_sshahin")).toBe("uae");
    expect(regionForHandle("zeniamk")).toBe("uae");
    expect(regionForHandle("sarahmalas")).toBe("uae");
    expect(regionForHandle("randdalati")).toBe("uae");
    expect(regionForHandle("rima_alosta")).toBe("uae");
    expect(regionForHandle("lookatsascha")).toBe("uae");
    expect(regionForHandle("elsakahwaji")).toBe("middle-east");
    expect(regionForHandle("leomessi")).toBeNull();
    expect(regionForHandle("technicalguruji")).toBeNull();
    expect(regionForHandle("UNKNOWN")).toBeNull();
    expect(REGION_BOARDS.map((board) => board.id)).toEqual([
      "usa",
      "europe",
      "middle-east",
      "uae",
    ]);
  });

  it("covers all requested Middle East countries and includes UAE in that board", () => {
    expect([...MIDDLE_EAST_COUNTRIES]).toEqual([
      "Qatar",
      "Saudi Arabia",
      "Jordan",
      "Egypt",
      "Kuwait",
      "United Arab Emirates",
      "Syria",
      "Lebanon",
      "Iraq",
      "Palestine",
      "Bahrain",
      "Oman",
      "Tunisia",
      "Morocco",
      "Libya",
      "Iran",
    ]);
    for (const handle of [
      "visitqatar",
      "visitsaudi",
      "visitjordan",
      "visitegypt",
      "visitkuwait",
      "emirates",
      "visitsyria",
      "visitlebanon",
      "visitiraq",
      "explorepalestine",
      "visitbahrain",
      "visitoman",
      "visittunisia",
      "visitmorocco",
      "alisha_sajjal",
      "alitofique",
      "hinaashh",
      "jexmi",
      "najet.dh",
      "elsakahwaji",
      "donya_esmailiii",
      "aiamwa",
      "dina_h_ussien",
      "poojaabis",
      "taranum_sshahin",
      "dina.ak",
      "anshi_pandyala_official",
      "zeniamk",
      "sarahmalas",
      "randdalati",
      "rima_alosta",
      "lookatsascha",
    ]) {
      expect(isInRegionBoard(handle, "middle-east"), handle).toBe(true);
    }
    expect(isInRegionBoard("emirates", "uae")).toBe(true);
    expect(isInRegionBoard("taylorswift", "middle-east")).toBe(false);
  });

  it("builds a separate top-ten board for each region", () => {
    const board = rankProfiles(
      [
        profile("taylorswift", 100_000_000, [post("a", 2, 100_000)]),
        profile("davidguetta", 12_000_000, [post("b", 2, 50_000)]),
        profile("aljazeera", 15_000_000, [post("c", 2, 50_000)]),
        profile("qatarairways", 9_200_000, [post("d", 2, 20_000)]),
        profile("baneenstars", 6_000_000, [post("e", 2, 20_000)], "📍DUBAI"),
        profile("leomessi", 500_000_000, [post("f", 2, 100_000)]),
      ],
      NOW,
    );

    expect(board.regional.usa.map((entry) => entry.username)).toEqual(["taylorswift"]);
    expect(board.regional.europe.map((entry) => entry.username)).toEqual(["davidguetta"]);
    expect(board.regional["middle-east"].map((entry) => entry.username)).toEqual([
      "qatarairways",
      "baneenstars",
    ]);
    expect(board.regional.uae.map((entry) => entry.username)).toEqual(["baneenstars"]);
  });

  it("requires public country evidence on Middle East and UAE boards", () => {
    const board = rankProfiles(
      [
        profile("emirates", 9_000_000, [post("a", 2, 20_000)]),
        profile(
          "aljazeera",
          15_000_000,
          [{ ...post("b", 2, 20_000), caption: "Launching in India", hashtags: ["#India"] }],
        ),
        profile("baneenstars", 6_000_000, [post("c", 2, 20_000)], "📍DUBAI"),
      ],
      NOW,
    );

    expect(board.regional["middle-east"].map((entry) => entry.username)).toEqual([
      "baneenstars",
    ]);
    expect(board.regional.uae.map((entry) => entry.username)).toEqual(["baneenstars"]);
  });

  it("keeps UAE board entries strictly to the UAE", () => {
    const board = rankProfiles(
      [
        profile("visitsaudi", 1_000_000, [post("a", 2, 20_000)], "Saudi official tourism"),
        profile("baneenstars", 6_000_000, [post("b", 2, 20_000)], "📍DUBAI"),
      ],
      NOW,
    );

    expect(board.regional.uae.map((entry) => entry.username)).toEqual(["baneenstars"]);
    expect(board.regional["middle-east"].map((entry) => entry.username)).toEqual([
      "baneenstars",
      "visitsaudi",
    ]);
  });

  it("caps the Middle East board at three entries per country while the UAE board stays UAE-only", () => {
    const uaeAccounts = [
      "baneenstars",
      "taimalfalasi",
      "wessamq",
      "sarahmalas",
      "randdalati",
    ].map((handle, index) =>
      profile(handle, 100_000_000 - index * 10_000_000, [post("p", 2, 1_000)], "Based in Dubai"),
    );
    const otherCountries = [
      profile("visitqatar", 50_000_000, [post("q", 2, 1_000)]),
      profile("visitsaudi", 40_000_000, [post("s", 2, 1_000)]),
      profile("visitjordan", 30_000_000, [post("j", 2, 1_000)]),
      profile("visitlebanon", 20_000_000, [post("l", 2, 1_000)]),
    ];
    const board = rankProfiles([...uaeAccounts, ...otherCountries], NOW);
    const middleEast = board.regional["middle-east"];

    expect(middleEast.slice(0, 3).map((entry) => entry.username)).toEqual([
      "baneenstars",
      "taimalfalasi",
      "wessamq",
    ]);
    expect(middleEast.map((entry) => entry.country)).toEqual([
      "United Arab Emirates",
      "United Arab Emirates",
      "United Arab Emirates",
      "Qatar",
      "Saudi Arabia",
      "Jordan",
      "Lebanon",
    ]);
    expect(board.regional.uae.map((entry) => entry.username)).toEqual(
      uaeAccounts.map((account) => account.username),
    );
  });

  it("excludes @technicalguruji from the Middle East and UAE boards", () => {
    const board = rankProfiles(
      [
        profile(
          "technicalguruji",
          6_300_000,
          [{ ...post("a", 2, 20_000), caption: "Launching in India", hashtags: ["#India"] }],
          "Engineer by Education, Entrepreneur by Profession",
        ),
      ],
      NOW,
    );

    expect(board.regional["middle-east"]).toEqual([]);
    expect(board.regional.uae).toEqual([]);
  });

  it("always returns all four boards, even for an empty pool", () => {
    const board = rankProfiles([], NOW);
    expect(Object.keys(board.regional)).toEqual(["usa", "europe", "middle-east", "uae"]);
    expect(board.regional.uae).toEqual([]);
  });
});
