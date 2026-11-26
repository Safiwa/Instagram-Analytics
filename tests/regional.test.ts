import { describe, expect, it } from "vitest";
import { inferCountrySignal } from "../src/core/analytics/country";
import { computeMetrics } from "../src/core/analytics/metrics";
import { rankFactors, regionalRankScore } from "../src/core/analytics/rank";
import {
  buildKeyComparisons,
  buildRegionalRanking,
  findRegionalCategoryPeer,
} from "../src/core/analytics/regional";
import { isMiddleEastProfile } from "../src/core/data/regional";
import { MIDDLE_EAST_COUNTRIES } from "../src/core/data/regions";
import type { CreatorProfile, MonthlyPoint, Post } from "../src/core/data/types";

const POSTED_AT = "2026-11-20T00:00:00.000Z";

function post(
  id: string,
  caption: string,
  likes: number,
  hashtags: string[] = [],
  comments = Math.round(likes * 0.1),
): Post {
  return {
    id,
    type: "Reel",
    caption,
    postedAt: POSTED_AT,
    likes,
    comments,
    hashtags,
  };
}

function profile(
  username: string,
  followers: number,
  captions: string[],
  options: {
    displayName?: string;
    bio?: string;
    accountCountry?: string | null;
    likes?: number;
    comments?: number;
    fakeFollowers?: number;
    followerHistory?: MonthlyPoint[];
  } = {},
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
    accountCountry:
      options.accountCountry === undefined ? "United Arab Emirates" : options.accountCountry,
    fakeFollowers: options.fakeFollowers,
    followerHistory: options.followerHistory ?? [],
    recentPosts: captions.map((caption, index) =>
      post(`${username}-${index}`, caption, likes, [], options.comments),
    ),
  };
}

describe("Middle East regional pool", () => {
  it("uses the Middle East board, which includes the dedicated UAE accounts", () => {
    expect(isMiddleEastProfile("hudabeauty")).toBe(true);
    expect(isMiddleEastProfile("qatarairways")).toBe(true);
    expect(isMiddleEastProfile("visitqatar")).toBe(true);
    expect(isMiddleEastProfile("emirates")).toBe(true);
    expect(isMiddleEastProfile("khalus_recipes")).toBe(true);
    expect(isMiddleEastProfile("ladyandhersweetescapes")).toBe(true);
    expect(isMiddleEastProfile("airagymn")).toBe(true);
    expect(isMiddleEastProfile("raw.lebanon")).toBe(true);
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
    // The five-row table may still list it, marked as a different category.
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
    // The card keeps the tightest band; the rank table widens to 3x so it can
    // show five profiles, and says so.
    // All test profiles share one country: three rows come first, the rest are
    // added past the country limit, marked.
    expect(visible).toHaveLength(5);
    expect(ranking?.rows.filter((row) => row.fill === "country-limit")).toHaveLength(2);
    expect(ranking?.band?.step).toBe("nearest");
    expect(findRegionalCategoryPeer(target, computeMetrics(target), pool)?.band?.step).toBe("close");
  });

  it("widens the follower band step by step and reports the band used", () => {
    const target = profile("target", 1_000_000, ["festival poetry"]);
    const twice = profile("twice", 2_000_000, ["festival poetry"]);
    const far = profile("far", 50_000_000, ["festival poetry"]);

    const peer = findRegionalCategoryPeer(target, computeMetrics(target), [twice, far]);
    expect(peer?.profile.username).toBe("twice");
    expect(peer?.band?.step).toBe("3x");
    // The rank table needs four peers, so with only two it falls back to the
    // nearest sizes and both appear.
    const table = buildRegionalRanking(target, computeMetrics(target), [twice, far]);
    expect(table?.band?.label).toContain("Nearest sizes available: fewer than 4 peers");
    expect(table?.total).toBe(3);

    const close = profile("close", 1_100_000, ["festival poetry"]);
    expect(findRegionalCategoryPeer(target, computeMetrics(target), [twice, close])?.band?.step).toBe(
      "close",
    );
  });

  it("falls back to the nearest Middle East sizes, labelled, when nothing is within 10x", () => {
    const target = profile("target", 31, ["festival poetry"], { likes: 3, comments: 1 });
    const far = profile("far", 2_000_000, ["festival poetry"]);
    const ranking = buildRegionalRanking(target, computeMetrics(target), [far]);

    expect(ranking?.band?.step).toBe("nearest");
    expect(ranking?.band?.label).toContain("Nearest sizes available");
  });

  it("matches a marketing agency with other agencies, never with creators", () => {
    const agencyBio = "Creative & digital analytics-based agency. Strategy, Content, Ads. Dubai, UAE";
    const target = profile("campaignmastersagency", 31, ["campaign launch"], {
      displayName: "Campaign Masters",
      bio: agencyBio,
      likes: 3,
      comments: 1,
    });
    const agency = profile("mkvdigital", 13_700, ["campaign launch"], {
      displayName: "MKV Digital",
      bio: "Dubai Based Digital Engagement Agency. Social Media Management",
    });
    const creator = profile("creator", 40, ["campaign launch"], { likes: 3, comments: 1 });

    const ranking = buildRegionalRanking(target, computeMetrics(target), [agency, creator]);
    // Agencies meet agencies only; a creator never fills a row.
    expect(ranking?.rows.map((row) => row.profile.username).sort()).toEqual([
      "campaignmastersagency",
      "mkvdigital",
    ]);
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

  it("rejects targets outside the exact Middle East list and curated-only attribution", () => {
    const peer = profile("peer", 1_100_000, ["festival poetry"]);
    const nonMiddleEast = profile("global.creator", 1_000_000, ["festival poetry"], {
      accountCountry: "India",
    });
    const curatedOnly = profile("emirates", 1_000_000, ["festival poetry"], {
      accountCountry: null,
      displayName: "Digital Creator",
      bio: "Digital creator",
    });

    expect(findRegionalCategoryPeer(nonMiddleEast, computeMetrics(nonMiddleEast), [peer])).toBeNull();
    expect(
      buildRegionalRanking(nonMiddleEast, computeMetrics(nonMiddleEast), [peer]),
    ).toBeNull();
    expect(findRegionalCategoryPeer(curatedOnly, computeMetrics(curatedOnly), [peer])).toBeNull();
    expect(buildRegionalRanking(curatedOnly, computeMetrics(curatedOnly), [peer])).toBeNull();
  });

  it("keeps unpublished and non-Middle-East profiles out of the peer rows", () => {
    const target = profile("target", 1_000_000, ["festival poetry"], { accountCountry: null });
    const inside = profile("lebanon.creator", 1_100_000, ["festival poetry"], {
      accountCountry: "Lebanon",
    });
    const outside = profile("india.creator", 1_100_000, ["festival poetry"], {
      accountCountry: "India",
    });
    const curatedOnly = profile("emirates", 1_100_000, ["festival poetry"], {
      accountCountry: null,
      displayName: "Digital Creator",
      bio: "Digital creator",
    });

    const ranking = buildRegionalRanking(target, computeMetrics(target), [
      inside,
      outside,
      curatedOnly,
    ]);

    expect(ranking?.rows.map((row) => row.profile.username)).toEqual(["target", "lebanon.creator"]);
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
    const low = profile("low", 800_000, ["festival poetry"], {
      likes: 500,
      accountCountry: "Qatar",
    });
    const balanced = profile("balanced", 1_000_000, ["festival poetry"], {
      likes: 3_000,
      accountCountry: "Jordan",
    });
    const high = profile("high", 1_200_000, ["festival poetry"], {
      likes: 9_000,
      accountCountry: "Lebanon",
    });
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
    const otherCountries = MIDDLE_EAST_COUNTRIES.filter(
      (country) => country !== "United Arab Emirates",
    );
    for (let index = 1; index <= 12; index += 1) {
      pool.push(
        profile(`peer.${index}`, 900_000 + index * 10_000, ["festival poetry"], {
          likes: 1_000 + index * 100,
          accountCountry: otherCountries[(index - 1) % otherCountries.length],
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
      profile("lebanon.creator", 63_000, ["lifestyle and food"], {
        displayName: "Lebanon Creator",
        bio: "Lebanese content creator",
        accountCountry: "Lebanon",
        likes: 500,
      }),
      profile("egypt.creator", 55_000, ["lifestyle and beauty"], {
        displayName: "Egypt Creator",
        bio: "Egyptian content creator",
        accountCountry: "Egypt",
        likes: 450,
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
      profile("jumeirah", 5_500_000, ["hotel and hospitality offers"], {
        displayName: "Jumeirah",
        bio: "Beautiful hospitality, generously shared.",
      }),
    ];

    const ranking = buildRegionalRanking(target, computeMetrics(target), [target, ...peers]);
    const usernames = ranking!.rows.map((row) => row.profile.username);

    // Three UAE creator peers exist; the third is added past the
    // three-per-country limit, marked, to complete the table.
    expect(ranking?.total).toBe(4);
    expect(ranking?.rows.filter((row) => row.fill === "country-limit")).toHaveLength(1);
    expect(usernames).toContain("amrmaskoun");
    expect(usernames).not.toContain("technicalguruji");
    expect(usernames).not.toContain("jumeirah");
    expect(ranking!.rows.every((row) => row.profile.followers >= 4_075_425)).toBe(true);
    expect(ranking!.rows.every((row) => row.profile.followers <= 7_568_647)).toBe(true);
    expect(ranking!.rows.every((row) => row.country.country === "United Arab Emirates")).toBe(
      true,
    );
  });

  it("fills @alaaabuharb's Middle East panel from real in-band creator labels", () => {
    const target = profile("alaaabuharb", 2_400_000, ["daily beauty and lifestyle"], {
      displayName: "Alaa Abou Harb",
      bio: "Content creator 🎬 صانعة البهجه اليوميه 😌 📍 UAE 🇦🇪",
      likes: 65_000,
    });
    const peers = [
      profile("sarahmalas", 2_500_000, ["lifestyle and travel content"], {
        displayName: "Sarah Malas",
        bio: "Dubai Lifestyle & Travel Content Creator",
        likes: 131_000,
      }),
      profile("randdalati", 2_100_000, ["beauty fashion and lifestyle"], {
        displayName: "The Datis",
        bio: "Content Creator • Author • Journalist • Youtuber",
        likes: 26_000,
      }),
      profile("rima_alosta", 2_100_000, ["gaming beauty and lifestyle"], {
        displayName: "Rima Alosta",
        bio: "#1 Female Gaming Creator in MENA 🎮 Gaming • Beauty • Lifestyle 📍Dubai",
        likes: 9_700,
      }),
      profile("lookatsascha", 1_900_000, ["mindset discipline and lifestyle"], {
        displayName: "Sascha Burci | Content Creator",
        bio: "Italian. Living in Dubai. Mindset. Discipline. Lifestyle.",
        likes: 19_600,
      }),
      profile("jumeirah", 2_400_000, ["hotel and hospitality offers"], {
        displayName: "Jumeirah",
        bio: "Beautiful hospitality, generously shared.",
        likes: 1_000,
      }),
    ];
    const pool = [target, ...peers];
    const metrics = computeMetrics(target);

    const peer = findRegionalCategoryPeer(target, metrics, pool);
    const ranking = buildRegionalRanking(target, metrics, pool);
    const usernames = ranking!.rows.map((row) => row.profile.username);

    expect(peer).not.toBeNull();
    expect([
      "sarahmalas",
      "randdalati",
      "rima_alosta",
      "lookatsascha",
    ]).toContain(peer!.profile.username);
    // Two UAE peers within the limit, then two more marked as added past it.
    expect(ranking?.total).toBe(5);
    expect(usernames).toContain("alaaabuharb");
    expect(ranking?.rows.filter((row) => row.fill === "country-limit")).toHaveLength(2);
    expect(
      [
        "sarahmalas",
        "randdalati",
        "rima_alosta",
        "lookatsascha",
      ].some((username) => usernames.includes(username)),
    ).toBe(true);
    expect(ranking?.rows.find((row) => row.profile.username === "jumeirah")?.fill ?? "other-category").toBe("other-category");
    expect(ranking!.rows.every((row) => row.profile.followers >= 1_680_000)).toBe(true);
    expect(ranking!.rows.every((row) => row.profile.followers <= 3_120_000)).toBe(true);
    expect(ranking!.rows.every((row) => row.country.country === "United Arab Emirates")).toBe(
      true,
    );
  });

  it("still supports an explicit top-10 limit after the filters", () => {
    const target = profile("target", 1_000_000, ["festival poetry"]);
    const pool = [target];
    const otherCountries = MIDDLE_EAST_COUNTRIES.filter(
      (country) => country !== "United Arab Emirates",
    );
    for (let index = 1; index <= 12; index += 1) {
      pool.push(
        profile(`peer.${index}`, 900_000 + index * 10_000, ["festival poetry"], {
          likes: 1_000 + index * 100,
          accountCountry: otherCountries[(index - 1) % otherCountries.length],
        }),
      );
    }

    const ranking = buildRegionalRanking(target, computeMetrics(target), pool, 10);

    expect(ranking?.rows).toHaveLength(11); // target + top 10 peers
    expect(ranking?.total).toBe(11);
  });

  it("brackets a no-post profile with five real, explicitly labeled peers", () => {
    const target: CreatorProfile = {
      ...profile("zuhaboutique2024", 44_000, [], {
        displayName: "Zuha Boutique",
        bio: "No biography provided.",
        accountCountry: null,
      }),
      recentPosts: [],
      storedEngagement: {
        measuredOn: "2026-11-20",
        engagementRatePct: 1.2177911317490667,
        averageLikes: 47,
        averageComments: 22,
      },
    };
    const high = profile("khalus_recipes", 47_996, ["recipe and food in Dubai"], {
      displayName: "Khalid C",
      bio: "Easiest Recipes · Dubai food blogger",
      likes: 1_883,
    });
    const higher = profile("ladyandhersweetescapes", 55_396, ["dubai food vlog"], {
      displayName: "Lady Anne | Dubai Vlogger",
      bio: "Dubai Content creator and vlogger",
      likes: 858,
    });
    const lower = profile("airagymn", 36_007, ["beauty and training"], {
      displayName: "Irina Skobeleva",
      bio: "Beauty and training in Dubai",
      likes: 58,
      comments: 65,
      fakeFollowers: 18_364,
      followerHistory: [
        { month: "2026-09", followers: 37_690 },
        { month: "2026-10", followers: 36_007 },
      ],
    });
    const noPostPeer: CreatorProfile = {
      ...profile("raw.lebanon", 43_000, [], {
        displayName: "Nivine | Lebanon content creator",
        bio: "Lebanon content creator",
        accountCountry: "Lebanon",
      }),
      recentPosts: [],
    };
    const pool = [target, high, higher, lower, noPostPeer];
    const metrics = computeMetrics(target);

    const peer = findRegionalCategoryPeer(target, metrics, pool);
    const ranking = buildRegionalRanking(target, metrics, pool);
    const usernames = ranking!.rows.map((row) => row.profile.username);

    expect(metrics.engagementRate).toBe(1.22);
    expect(peer).not.toBeNull();
    expect(peer!.profile.username).not.toBe("raw.lebanon");
    expect(ranking?.total).toBe(5);
    expect(usernames).toEqual(
      expect.arrayContaining([
        "zuhaboutique2024",
        "khalus_recipes",
        "ladyandhersweetescapes",
        "airagymn",
        "raw.lebanon",
      ]),
    );
    expect(ranking?.targetRank).toBe(3);
    expect(ranking!.rows.find((row) => row.isTarget)?.engagementSource).toBe("stored-snapshot");
    expect(ranking!.rows.find((row) => row.profile.username === "raw.lebanon")?.postsNotExposed).toBe(
      true,
    );
  });

  it("brackets a no-post target between stronger and weaker peers after the country cap", () => {
    const target: CreatorProfile = {
      ...profile("zuhaboutique2024", 44_000, [], {
        displayName: "Zuha Boutique",
        bio: "No biography provided.",
        accountCountry: null,
      }),
      recentPosts: [],
      storedEngagement: {
        measuredOn: "2026-11-20",
        engagementRatePct: 1.2177911317490667,
        averageLikes: 47,
        averageComments: 22,
      },
    };
    const pool = [
      target,
      profile("raw.lebanon", 55_079, ["beirut lebanon nightlife"], {
        displayName: "Nivine | Lebanon content creator",
        bio: "Lebanon content creator",
        accountCountry: "Lebanon",
        likes: 4_800,
        comments: 670,
      }),
      profile("khalus_recipes", 47_996, ["dubai food vlog"], {
        displayName: "Khalid C",
        bio: "Dubai food blogger",
        likes: 1_883,
        comments: 493,
      }),
      profile("zeniamk", 46_100, ["dubai beauty travel"], {
        displayName: "Zenia Mariam Khan | Dubai Creator",
        bio: "Dubai beauty and travel creator",
        likes: 188,
        comments: 18,
      }),
      profile("ola.alqodmani", 51_500, ["dubai travel family"], {
        displayName: "Ola Al Qodmani",
        bio: "Dubai travel creator",
        likes: 80,
        comments: 12,
        followerHistory: [
          { month: "2026-09", followers: 53_500 },
          { month: "2026-10", followers: 51_500 },
        ],
      }),
    ];
    // The public @airagymn profile does not publish an account country or a
    // country in its bio. Its real UAE hashtags are compound words, so this peer
    // only qualifies after the explicit hashtag edge matcher is applied.
    const airagymn: CreatorProfile = {
      ...profile("airagymn", 36_007, [], {
        displayName: "Irina Skobeleva",
        bio: "Living between air & earth 🤍\nAerial silks | Pilates | handstand and splits!\nSharing beauty, freedom & inspiration 🧘🏼‍♀️\nDM for training 🤸🏻🤸‍♀️",
        accountCountry: null,
        likes: 58,
        comments: 65,
        fakeFollowers: 18_364,
        followerHistory: [
          { month: "2026-09", followers: 37_690 },
          { month: "2026-10", followers: 36_007 },
        ],
      }),
      recentPosts: [
        post(
          "airagymn-hashtags",
          "Collecting flowers in my camera roll because real ones don’t last …forever 🌸🥀",
          58,
          ["#dubaimiraclegarden", "#miraclegarden", "#dubaireels", "#whatsondubai"],
          65,
        ),
      ],
    };
    pool.push(airagymn);
    const ranking = buildRegionalRanking(target, computeMetrics(target), pool);

    expect(inferCountrySignal(airagymn).basis).toBe("posts");
    expect(ranking?.targetRank).toBe(3);
    expect(ranking?.total).toBe(5);
    expect(ranking!.rows.filter((row) => row.country.country === "United Arab Emirates")).toHaveLength(
      3,
    );
    expect(ranking!.rows.filter((row) => row.country.country === "Lebanon")).toHaveLength(1);
    expect(ranking!.rows.find((row) => row.isTarget)?.country.country).toBeNull();
  });
});

describe("Middle East country variety", () => {
  it("keeps at most three rows per country and draws the rest from other countries", () => {
    const target = profile("target", 100_000, ["festival poetry"]);
    const uae = Array.from({ length: 6 }, (_, index) =>
      profile(`uae${index}`, 90_000 + index * 1_000, ["festival poetry"]),
    );
    const lebanon = Array.from({ length: 4 }, (_, index) =>
      profile(`leb${index}`, 300_000 + index * 1_000, ["festival poetry"], { accountCountry: "Lebanon" }),
    );
    const ranking = buildRegionalRanking(target, computeMetrics(target), [...uae, ...lebanon], 9);
    const countries = ranking?.rows.map((row) => row.country.country) ?? [];
    const perCountry = new Map<string, number>();
    for (const country of countries) {
      perCountry.set(String(country), (perCountry.get(String(country)) ?? 0) + 1);
    }
    // Lebanon gets its three rows before any UAE row goes past the limit, and
    // every row beyond three per country is marked.
    expect(perCountry.get("Lebanon")).toBe(3);
    expect(ranking?.total).toBe(10);
    const unmarked = ranking?.rows.filter((row) => row.fill !== "country-limit") ?? [];
    const unmarkedPerCountry = new Map<string, number>();
    for (const row of unmarked) {
      const key = String(row.country.country);
      unmarkedPerCountry.set(key, (unmarkedPerCountry.get(key) ?? 0) + 1);
    }
    expect(Math.max(...unmarkedPerCountry.values())).toBeLessThanOrEqual(3);
  });
});

