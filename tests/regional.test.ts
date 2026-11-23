import { describe, expect, it } from "vitest";
import { computeMetrics } from "../src/core/analytics/metrics";
import { rankFactors, regionalRankScore } from "../src/core/analytics/rank";
import {
  buildKeyComparisons,
  buildRegionalRanking,
  findRegionalCategoryPeer,
} from "../src/core/analytics/regional";
import { isMiddleEastProfile } from "../src/core/data/regional";
import type { CreatorProfile, Post } from "../src/core/data/types";

const POSTED_AT = "2026-11-20T00:00:00.000Z";

function post(id: string, caption: string, likes: number, hashtags: string[] = []): Post {
  return {
    id,
    type: "Reel",
    caption,
    postedAt: POSTED_AT,
    likes,
    comments: Math.round(likes * 0.1),
    hashtags,
  };
}

function profile(
  username: string,
  followers: number,
  captions: string[],
  options: { displayName?: string; bio?: string; likes?: number; fakeFollowers?: number } = {},
): CreatorProfile {
  const likes = options.likes ?? 2_000;
  return {
    username,
    displayName: options.displayName ?? "Digital Creator",
    category: "Instagram Professional",
    bio: options.bio ?? "Digital creator",
    followers,
    following: 100,
    postsCount: captions.length,
    isVerified: false,
    source: "live",
    fakeFollowers: options.fakeFollowers,
    followerHistory: [],
    recentPosts: captions.map((caption, index) => post(`${username}-${index}`, caption, likes)),
  };
}

describe("Middle East regional pool", () => {
  it("uses the Middle East board, which includes the dedicated UAE accounts", () => {
    expect(isMiddleEastProfile("hudabeauty")).toBe(true);
    expect(isMiddleEastProfile("qatarairways")).toBe(true);
    expect(isMiddleEastProfile("visitqatar")).toBe(true);
    expect(isMiddleEastProfile("emirates")).toBe(true);
    expect(isMiddleEastProfile("selenagomez")).toBe(false);
    expect(isMiddleEastProfile("gucci")).toBe(false);
  });
});

describe("Middle East category peer", () => {
  it("uses category labels first and keeps business/travel accounts out", () => {
    const target = profile("target", 300_000, ["product reviews and travel offers"], {
      displayName: "Rimo BA",
      bio: "Beauty skincare creator",
    });
    const hotel = profile("jumeirah", 280_000, ["beauty skincare travel"], {
      displayName: "Jumeirah",
      bio: "Beautiful hospitality, generously shared.",
    });
    const creator = profile("creator", 290_000, ["beauty news and product launch"], {
      displayName: "Huda Beauty",
      bio: "Beauty makeup artist and blogger",
    });

    const match = findRegionalCategoryPeer(target, computeMetrics(target), [hotel, creator]);

    expect(match?.profile.username).toBe("creator");
    expect(match?.category).toBe("Beauty, cosmetic & personal care");
    expect(match?.sharedActivity.join(" ")).toContain("Beauty");
  });

  it("accepts any creator label in the same creator group", () => {
    const target = profile("target", 1_000_000, ["festival poetry"], {
      displayName: "Public Figure",
      bio: "Actor singer",
    });
    const digital = profile("digital", 1_100_000, ["reel video"], {
      displayName: "Digital Creator",
      bio: "Digital creator",
    });
    const news = profile("news", 1_050_000, ["festival poetry"], {
      displayName: "News Outlet",
      bio: "News media headlines",
    });

    const match = findRegionalCategoryPeer(target, computeMetrics(target), [news, digital]);

    expect(match?.profile.username).toBe("digital");
    expect(match?.category).toBe("Digital creator");
  });

  it("prefers an exact category label over another compatible creator label", () => {
    const target = profile("target", 60_000, ["festival poetry"], {
      displayName: "Daily Posts",
      bio: "Content creator sharing more",
    });
    const exact = profile("exact", 60_000, ["festival poetry"], {
      displayName: "Exact Creator",
      bio: "Content creator with honest reviews",
      likes: 100,
    });
    const related = profile("related", 60_000, ["festival poetry"], {
      displayName: "Digital Creator",
      bio: "Digital creator",
      likes: 5_000,
    });

    const match = findRegionalCategoryPeer(target, computeMetrics(target), [related, exact]);

    expect(match?.profile.username).toBe("exact");
    expect(match?.sameCategoryLabel).toBe(true);
  });

  it("rejects fallback labels that are not explicit public categories", () => {
    const target = profile("target", 1_000_000, ["festival poetry"]);
    const fallback = profile("qatar", 1_100_000, ["travel destination"], {
      displayName: "Qatar",
      bio: "Qatar through the eyes of its people.",
    });

    const match = findRegionalCategoryPeer(target, computeMetrics(target), [fallback]);

    expect(match).toBeNull();
    expect(buildRegionalRanking(target, computeMetrics(target), [fallback])).toBeNull();
  });

  it("includes the ±30% follower band and rejects profiles outside it", () => {
    const target = profile("target", 1_000_000, ["festival poetry"]);
    const low = profile("low", 700_000, ["festival poetry"]);
    const high = profile("high", 1_300_000, ["festival poetry"]);
    const tooLow = profile("too.low", 699_999, ["festival poetry"]);
    const tooHigh = profile("too.high", 1_300_001, ["festival poetry"]);
    const pool = [tooHigh, tooLow, high, low];

    const match = findRegionalCategoryPeer(target, computeMetrics(target), pool);
    const ranking = buildRegionalRanking(target, computeMetrics(target), pool);
    const visible = ranking?.rows.map((row) => row.profile.username) ?? [];

    expect(["low", "high"]).toContain(match?.profile.username);
    expect(visible).toContain("low");
    expect(visible).toContain("high");
    expect(visible).not.toContain("too.low");
    expect(visible).not.toContain("too.high");
  });

  it("returns no peer and no rank table when every candidate is outside the band", () => {
    const target = profile("target", 1_000_000, ["festival poetry"]);
    const far = profile("far", 2_000_000, ["festival poetry"]);

    expect(findRegionalCategoryPeer(target, computeMetrics(target), [far])).toBeNull();
    expect(buildRegionalRanking(target, computeMetrics(target), [far])).toBeNull();
  });

  it("returns no peer when the searched account has no creator category label", () => {
    const target = profile("jumeirah", 1_000_000, ["festival poetry"], {
      displayName: "Jumeirah",
      bio: "Beautiful hospitality, generously shared.",
    });
    const creator = profile("creator", 1_100_000, ["festival poetry"], {
      displayName: "Digital Creator",
      bio: "Digital creator",
    });

    expect(findRegionalCategoryPeer(target, computeMetrics(target), [creator])).toBeNull();
    expect(buildRegionalRanking(target, computeMetrics(target), [creator])).toBeNull();
  });

  it("keeps the visible match reasons category-first and short", () => {
    const target = profile("target", 1_000_000, ["festival poetry"]);
    const peer = profile("peer", 1_100_000, ["festival poetry"]);

    const match = findRegionalCategoryPeer(target, computeMetrics(target), [peer])!;
    const reasons = match.matchReasons.join(" ");

    expect(reasons).toContain("same category label: Digital creator");
    expect(reasons).toContain("shared activity:");
    expect(reasons).not.toContain("±30%");
    expect(reasons).not.toContain("Reels/post captions and hashtags only");
    expect(reasons).not.toContain("55% followers");
    expect(reasons).not.toContain("country not published on Instagram");
  });

  it("returns null for an empty regional pool", () => {
    const target = profile("solo", 1_000, ["festival poetry"]);
    expect(findRegionalCategoryPeer(target, computeMetrics(target), [])).toBeNull();
    expect(buildRegionalRanking(target, computeMetrics(target), [])).toBeNull();
  });
});

describe("key regional comparisons", () => {
  it("covers the five public signals plus the authenticity estimate", () => {
    const target = profile("target", 1_000_000, ["festival poetry"]);
    const peer = profile("peer", 1_100_000, ["festival poetry"], { likes: 1_800 });
    const match = findRegionalCategoryPeer(target, computeMetrics(target), [peer])!;

    const comparisons = buildKeyComparisons(target, computeMetrics(target), match);

    expect(comparisons.map((row) => row.label)).toEqual([
      "Followers",
      "Engagement rate",
      "Avg likes",
      "Avg comments",
      "Follower change",
      "Authenticity",
    ]);
    expect(comparisons[0].target).toBe("1M");
    expect(comparisons[4].target).toContain("est.");
    expect(comparisons[5].target).toContain("est.");
  });
});

describe("Middle East authenticity-aware ranking", () => {
  it("orders eligible profiles by the regional rank score", () => {
    const target = profile("target", 1_000_000, ["festival poetry"]);
    const low = profile("low", 800_000, ["festival poetry"], { likes: 500 });
    const balanced = profile("balanced", 1_000_000, ["festival poetry"], { likes: 3_000 });
    const high = profile("high", 1_200_000, ["festival poetry"], { likes: 9_000 });
    const peers = [high, low, balanced];

    const ranking = buildRegionalRanking(target, computeMetrics(target), [target, ...peers])!;
    const scores = ranking.rows.map((row) => row.rankScore);
    const expectedPeers = [...peers]
      .map((candidate) => {
        const metrics = computeMetrics(candidate);
        return {
          username: candidate.username,
          score: regionalRankScore(rankFactors(candidate, metrics), metrics.authenticityPct),
        };
      })
      .sort((left, right) => right.score - left.score)
      .map((entry) => entry.username);

    expect(scores).toEqual([...scores].sort((left, right) => right - left));
    expect(ranking.rows.filter((row) => !row.isTarget).map((row) => row.profile.username)).toEqual(
      expectedPeers,
    );
    expect(ranking.total).toBe(4);
  });

  it("ranks a lower modeled fake-follower share above a slightly larger account", () => {
    const target = profile("target", 1_000_000, ["festival poetry"], {
      displayName: "Public Figure",
      bio: "Actor singer",
      fakeFollowers: 500_000,
    });
    const clean = profile("clean", 1_000_000, ["festival poetry"], {
      displayName: "Digital Creator",
      bio: "Digital creator",
      fakeFollowers: 0,
    });
    const dirty = profile("dirty", 1_100_000, ["festival poetry"], {
      displayName: "Digital Creator",
      bio: "Digital creator",
      likes: 2_200,
      fakeFollowers: 550_000,
    });

    const ranking = buildRegionalRanking(target, computeMetrics(target), [target, clean, dirty])!;

    expect(ranking.rows[0].profile.username).toBe("clean");
    expect(
      ranking.rows.filter((row) => !row.isTarget).map((row) => row.profile.username),
    ).toEqual(["clean", "dirty"]);
    expect(ranking.rows[0].rankScore).toBeGreaterThan(ranking.rows[1].rankScore);
  });

  it("defaults to five profiles: the target plus four peers", () => {
    const target = profile("target", 1_000_000, ["festival poetry"]);
    const pool = [target];
    for (let index = 1; index <= 12; index += 1) {
      pool.push(
        profile(`peer.${index}`, 900_000 + index * 10_000, ["festival poetry"], {
          likes: 1_000 + index * 100,
        }),
      );
    }

    const ranking = buildRegionalRanking(target, computeMetrics(target), pool);

    expect(ranking?.rows).toHaveLength(5); // target + top 4 peers
    expect(ranking?.total).toBe(5);
    expect(ranking!.rows.filter((row) => row.isTarget)).toHaveLength(1);
  });

  it("fills the panel for a small UAE content creator with real-label peers", () => {
    const target = profile("target", 58_940, ["lifestyle spots in UAE"], {
      displayName: "Hadia Nashed",
      bio: "Content Creator UGC Brand Storyteller",
      likes: 400,
    });
    const peers = [
      profile("wide.content", 71_457, ["skincare and beauty"], {
        displayName: "Aika",
        bio: "UAE Content Creator | Beauty",
      }),
      profile("content.one", 59_963, ["skincare and makeup"], {
        displayName: "Dina Hussien",
        bio: "Content creator and UGC Creator",
      }),
      profile("content.two", 58_197, ["beauty and makeup"], {
        displayName: "Pooja Biswas",
        bio: "Content Creator and makeup artist",
      }),
      profile("beauty.one", 61_982, ["beauty and skincare"], {
        displayName: "Taranum",
        bio: "Beauty and Skincare creator",
      }),
      profile("beauty.two", 60_264, ["fashion and beauty"], {
        displayName: "Dina Abdul",
        bio: "Fashion and Beauty lifestyle",
      }),
      profile("model.one", 65_744, ["fashion and modelling"], {
        displayName: "Anshi Aneesh",
        bio: "Model in UAE",
      }),
      profile("small.beauty", 46_091, ["beauty and travel"], {
        displayName: "Zenia Khan",
        bio: "Dubai Creator | Beauty and Travel",
      }),
    ];

    const ranking = buildRegionalRanking(target, computeMetrics(target), [target, ...peers]);

    expect(ranking?.total).toBe(5);
    expect(ranking?.rows.filter((row) => row.isTarget)).toHaveLength(1);
    expect(ranking!.rows.every((row) => row.profile.followers >= 41_258)).toBe(true);
    expect(ranking!.rows.every((row) => row.profile.followers <= 76_622)).toBe(true);
  });

  it("fills @amrmaskoun's Middle East panel from real in-band UAE creator labels", () => {
    const target = profile("amrmaskoun", 5_822_036, ["actor director and film"], {
      displayName: "Amr Maskoun",
      bio: "Founder & CEO of @ofoq.creative 🇸🇾 🇫🇷 🇦🇪 Actor Director",
      likes: 18_000,
    });
    const peers = [
      profile("wessamq", 5_131_128, ["comedy and lifestyle"], {
        displayName: "Wessam Q",
        bio: "Content creator",
      }),
      profile("taimalfalasi", 4_502_538, ["travel food and lifestyle"], {
        displayName: "Taim AlFalasi تيم الفلاسي | 🇦🇪",
        bio: "travel food lifestyle",
      }),
      profile("baneenstars", 5_997_069, ["fashion beauty and lifestyle"], {
        displayName: "Baneen Naem",
        bio: "Fashion Lifestyle Beauty",
      }),
      profile("technicalguruji", 6_295_677, ["technology and youtube"], {
        displayName: "Gaurav Chaudhary",
        bio: "YouTuber and video creator",
      }),
      profile("jumeirah", 5_500_000, ["hotel and hospitality offers"], {
        displayName: "Jumeirah",
        bio: "Beautiful hospitality, generously shared.",
      }),
    ];

    const ranking = buildRegionalRanking(target, computeMetrics(target), [target, ...peers]);
    const usernames = ranking!.rows.map((row) => row.profile.username);

    expect(ranking?.total).toBe(5);
    expect(usernames).toContain("amrmaskoun");
    expect(usernames).toContain("wessamq");
    expect(usernames).toContain("taimalfalasi");
    expect(usernames).toContain("baneenstars");
    expect(usernames).toContain("technicalguruji");
    expect(usernames).not.toContain("jumeirah");
    expect(ranking!.rows.every((row) => row.profile.followers >= 4_075_425)).toBe(true);
    expect(ranking!.rows.every((row) => row.profile.followers <= 7_568_647)).toBe(true);
    expect(ranking!.rows.every((row) => row.country.country === "United Arab Emirates")).toBe(
      true,
    );
  });

  it("still supports an explicit top-10 limit after the filters", () => {
    const target = profile("target", 1_000_000, ["festival poetry"]);
    const pool = [target];
    for (let index = 1; index <= 12; index += 1) {
      pool.push(
        profile(`peer.${index}`, 900_000 + index * 10_000, ["festival poetry"], {
          likes: 1_000 + index * 100,
        }),
      );
    }

    const ranking = buildRegionalRanking(target, computeMetrics(target), pool, 10);

    expect(ranking?.rows).toHaveLength(11); // target + top 10 peers
    expect(ranking?.total).toBe(11);
  });
});
