import { describe, expect, it } from "vitest";
import { computeMetrics } from "../src/core/analytics/metrics";
import { buildPeerRanking, findClosestPeer, findSimilarPeers } from "../src/core/analytics/peer";
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

function profile(username: string, followers: number, bio: string, likes: number): CreatorProfile {
  return {
    username,
    displayName: username,
    category: "Instagram Professional",
    bio,
    followers,
    following: 100,
    postsCount: 20,
    isVerified: false,
    source: "live",
    followerHistory: [],
    recentPosts: [post(likes), post(likes)],
  };
}

describe("closest public peer", () => {
  it("prefers a similarly sized profile with shared business themes", () => {
    const target = profile("uae.style", 60_000, "Fashion and skincare boutique in Dubai", 2_000);
    const fashion = profile("fashion.uae", 75_000, "Fashion and beauty daily looks", 2_100);
    const footballer = profile("cristiano", 680_000_000, "Football player", 5_000_000);

    const match = findClosestPeer(target, computeMetrics(target), [footballer, fashion]);

    expect(match?.profile.username).toBe("fashion.uae");
    expect(match?.reasons.join(" ")).toContain("fashion");
    expect(match?.score).toBeGreaterThan(0);
  });

  it("ignores fallback category labels when the target has an explicit label", () => {
    const target = profile("rimo.style", 300_000, "Beauty skincare creator", 2_000);
    const fallback = profile(
      "qatar",
      280_000,
      "Qatar through the eyes of its people.",
      1_900,
    );
    const explicit = profile("beauty.peer", 290_000, "Beauty makeup reviews", 2_100);

    const match = findClosestPeer(target, computeMetrics(target), [fallback, explicit]);

    expect(match?.profile.username).toBe("beauty.peer");
  });

  it("excludes the target itself and handles an empty pool", () => {
    const target = profile("solo", 20_000, "Food blogger", 800);

    expect(findClosestPeer(target, computeMetrics(target), [])).toBeNull();
    expect(findClosestPeer(target, computeMetrics(target), [target])).toBeNull();
  });

  it("does not fall back to another country when the target has an inferred country", () => {
    const target = profile("dubai.target", 60_000, "Fashion and beauty", 2_000);
    const london = profile("london.peer", 65_000, "Fashion and beauty", 2_200);
    const unknown = profile("unknown.peer", 62_000, "Fashion and beauty", 2_100);

    expect(findClosestPeer(target, computeMetrics(target), [london, unknown])).toBeNull();
  });
});

describe("country-aware peer suggestions", () => {
  it("prefers same-country profiles and rejects out-of-range followers", () => {
    const target = profile("dubai.style", 60_000, "Fashion and beauty", 2_000);
    const closeFit = profile("uae.close", 70_000, "Fashion and beauty", 2_200);
    const weakFit = profile("uae.weak", 2_000, "Fashion and beauty", 100);
    const otherCountry = profile("london.style", 90_000, "Fashion and beauty", 3_000);

    const suggestions = findSimilarPeers(target, computeMetrics(target), [
      otherCountry,
      weakFit,
      closeFit,
    ]);

    expect(suggestions.map((match) => match.profile.username)).toEqual(["uae.close"]);
    expect(suggestions.every((match) => match.country.country === "United Arab Emirates")).toBe(
      true,
    );
    expect(suggestions[0].reasons.join(" ")).toContain("similar audience size (within ±30%) and engagement range");
    expect(suggestions[0].reasons.join(" ")).toContain("five-factor fit");
  });

  it("never benchmarks thousands of followers against millions", () => {
    const target = profile("small.style", 50_000, "Fashion and beauty", 1_500);
    const mega = profile("mega.style", 5_000_000, "Fashion and beauty", 100_000);
    const hugeEngagement = profile("viral.style", 55_000, "Fashion and beauty", 60_000);

    const suggestions = findSimilarPeers(target, computeMetrics(target), [mega, hugeEngagement]);

    expect(suggestions).toEqual([]);
  });

  it("uses promoted-location hashtags when the handle has no country word", () => {
    const target = {
      ...profile("style.studio", 60_000, "Fashion and beauty", 2_000),
      recentPosts: [
        { ...post(2_000), caption: "Dubai edit", hashtags: ["#Dubai", "#UAE"] },
        { ...post(1_800), caption: "Abu Dhabi find", hashtags: ["#AbuDhabi"] },
      ],
    };
    const sameCountry = profile("beauty.dubai", 40_000, "Fashion and beauty", 1_500);
    const otherCountry = profile("beauty.paris", 80_000, "Fashion and beauty", 2_500);

    const match = findClosestPeer(target, computeMetrics(target), [otherCountry, sameCountry]);

    expect(match?.profile.username).toBe("beauty.dubai");
    expect(match?.countryRelationship).toBe("same-country");
  });
});

describe("peer ranking for the searched profile", () => {
  it("includes the searched profile and ranks the group by weighted score", () => {
    const target = profile("searched", 60_000, "Fashion and skincare boutique", 2_000);
    const low = profile("low.peer", 62_000, "Fashion and beauty", 1_600);
    const high = profile("high.peer", 58_000, "Fashion and style", 2_600);
    const pool = [target, low, high];

    const ranking = buildPeerRanking(target, computeMetrics(target), pool);

    expect(ranking).not.toBeNull();
    expect(ranking!.rows.map((row) => row.profile.username)).toEqual([
      "high.peer",
      "searched",
      "low.peer",
    ]);
    expect(ranking!.targetRank).toBe(2);
    expect(ranking!.total).toBe(3);
    expect(ranking!.outperformedPercent).toBe(50);
    const scores = ranking!.rows.map((row) => row.rankScore);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(ranking!.rows.every((row) => typeof row.avgLikes === "number")).toBe(true);
    expect(ranking!.rows.every((row) => typeof row.avgComments === "number")).toBe(true);
    expect(ranking!.rows.every((row) => typeof row.followerChangePct === "number")).toBe(true);
    expect(ranking!.rows.find((row) => row.isTarget)?.matchScore).toBeNull();
    expect(ranking!.rows.filter((row) => !row.isTarget).every((row) => row.matchScore !== null)).toBe(
      true,
    );
  });

  it("shows the searched profile in a five-profile group", () => {
    const target = profile("searched", 60_000, "Fashion and beauty", 2_000);
    const pool = [target];
    for (let index = 1; index <= 6; index += 1) {
      pool.push(profile(`peer.${index}`, 58_000 + index * 1_000, "Fashion and beauty", 1_900 + index * 20));
    }

    const ranking = buildPeerRanking(target, computeMetrics(target), pool);

    expect(ranking!.rows).toHaveLength(5); // target + four closest peers
    expect(ranking!.total).toBe(5);
    expect(ranking!.rows.filter((row) => row.isTarget)).toHaveLength(1);
  });

  it("does not mix lower country tiers when same-country peers exist", () => {
    const target = profile("dubai.target", 60_000, "Fashion and beauty", 2_000);
    const pool = [
      target,
      profile("uae.peer1", 61_000, "Fashion and beauty", 2_100),
      profile("uae.peer2", 62_000, "Fashion and beauty", 2_200),
      profile("london.peer1", 58_000, "Fashion and beauty", 1_900),
      profile("paris.peer1", 59_000, "Fashion and beauty", 2_050),
      profile("tokyo.peer1", 57_000, "Fashion and beauty", 1_800),
    ];

    const ranking = buildPeerRanking(target, computeMetrics(target), pool);
    const usernames = ranking!.rows.map((row) => row.profile.username);

    expect(usernames).toEqual(
      expect.arrayContaining(["dubai.target", "uae.peer1", "uae.peer2"]),
    );
    // Same-country peers come first and unmarked; other countries only fill the
    // remaining rows of the five-profile table, marked as such.
    expect(ranking!.total).toBe(5);
    for (const row of ranking!.rows) {
      if (row.profile.username.startsWith("uae.") || row.isTarget) {
        expect(row.fill).toBeUndefined();
      } else {
        expect(row.fill).toBe("other-country");
      }
    }
  });

  it("fills a known-country table from other countries only when no same-country peer exists, and marks it", () => {
    const target = profile("dubai.target", 60_000, "Fashion and beauty", 2_000);
    const london = profile("london.peer", 65_000, "Fashion and beauty", 2_200);
    const unknown = profile("unknown.peer", 62_000, "Fashion and beauty", 2_100);

    const ranking = buildPeerRanking(target, computeMetrics(target), [target, london, unknown]);
    const peers = ranking?.rows.filter((row) => !row.isTarget) ?? [];
    expect(peers.length).toBeGreaterThan(0);
    expect(peers.every((row) => row.fill === "other-country" || row.fill === "same-region")).toBe(true);
  });

  it("never marks rows as other-country when the target country is not published", () => {
    const target = profile("unpublished.creator", 60_000, "Fashion and beauty", 2_000);
    const sameRegion = profile("uae.peer", 61_000, "Fashion and beauty", 2_100);
    const differentCountry = profile("london.peer", 62_000, "Fashion and beauty", 2_200);
    const unknown = profile("unknown.peer", 63_000, "Fashion and beauty", 2_300);

    const ranking = buildPeerRanking(target, computeMetrics(target), [
      target,
      sameRegion,
      differentCountry,
      unknown,
    ]);
    const usernames = ranking!.rows.map((row) => row.profile.username);

    expect(usernames).toContain("uae.peer");
    expect(ranking!.total).toBe(4);
    for (const row of ranking!.rows) {
      expect(row.fill === undefined || row.fill === "nearest").toBe(true);
    }
  });

  it("falls back to inferred creator labels only when explicit peers are scarce", () => {
    const target = profile("dubai.target", 60_000, "Fashion and beauty", 2_000);
    const explicit = profile("uae.explicit", 61_000, "Beauty skincare reviews", 2_100);
    const inferred = profile("uae.inferred", 62_000, "", 2_200);
    const business = profile("uae.brand", 63_000, "", 2_300);
    business.bio = "Retail mall and shopping offers";

    const strict = findClosestPeer(target, computeMetrics(target), [target, inferred]);
    expect(strict).toBeNull();

    const ranking = buildPeerRanking(target, computeMetrics(target), [
      target,
      explicit,
      inferred,
      business,
    ]);
    const usernames = ranking!.rows.map((row) => row.profile.username);

    expect(usernames).toContain("uae.explicit");
    expect(usernames).toContain("uae.inferred");
    // A business only fills the last row, marked as a different category.
    expect(ranking!.rows.find((row) => row.profile.username === "uae.brand")?.fill).toBe(
      "other-category",
    );
  });

  it("returns null when no comparable peer is available", () => {
    const target = profile("solo", 20_000, "Food blogger", 800);
    expect(buildPeerRanking(target, computeMetrics(target), [])).toBeNull();
  });
});

describe("progressive follower bands and join dates", () => {
  it("widens to 3x when nobody is within ±30%, and says so", () => {
    const target = profile("dubai.style", 60_000, "Fashion and beauty", 2_000);
    const wider = profile("uae.wider", 150_000, "Fashion and beauty", 5_000);

    const [match] = findSimilarPeers(target, computeMetrics(target), [wider]);
    expect(match?.profile.username).toBe("uae.wider");
    expect(match?.band?.step).toBe("3x");
    expect(match?.reasons.join(" ")).toContain("within 3x");
  });

  it("prefers a peer that started posting around the same time when other signals tie", () => {
    const at = (base: CreatorProfile, postedAt: string): CreatorProfile => ({
      ...base,
      postsCount: 2,
      recentPosts: base.recentPosts.map((item) => ({ ...item, postedAt })),
    });
    const target = at(profile("dubai.style", 60_000, "Fashion and beauty", 2_000), "2026-11-20T00:00:00.000Z");
    const sameEra = at(profile("uae.a", 62_000, "Fashion and beauty", 2_000), "2026-10-01T00:00:00.000Z");
    const oldEra = at(profile("uae.b", 62_000, "Fashion and beauty", 2_000), "2020-01-01T00:00:00.000Z");

    const [first] = findSimilarPeers(target, computeMetrics(target), [oldEra, sameEra]);
    expect(first?.profile.username).toBe("uae.a");
    expect(first?.reasons.join(" ")).toContain("started posting around the same time");
  });
});


describe("five-row same-country rank", () => {
  it("ranks a small UAE agency against four UAE agencies, not creators", () => {
    const agency = (username: string, followers: number, likes: number): CreatorProfile =>
      profile(username, followers, "Dubai digital marketing agency", likes);
    const target = profile("campaignmastersagency", 31, "Creative & digital analytics-based agency. Dubai, UAE", 3);
    const pool = [
      agency("dubai.a", 13_700, 40),
      agency("dubai.b", 8_800, 30),
      agency("dubai.c", 72_900, 10),
      agency("dubai.d", 500, 8),
      profile("dubai.creator", 40, "Digital creator in Dubai", 3),
    ];

    const ranking = buildPeerRanking(target, computeMetrics(target), pool);
    expect(ranking?.total).toBe(5);
    expect(ranking?.rows.map((row) => row.profile.username)).not.toContain("dubai.creator");
    expect(ranking?.rows.every((row) => row.category === "Marketing agency")).toBe(true);
  });
});

describe("Syrian same-country peers", () => {
  it("ranks @yaman.najjar against tracked Syrian public figures and creators", () => {
    const target = profile(
      "yaman.najjar",
      691_500,
      "Actor | Streamer 📹 📍🇸🇾🇳🇱 (YN Is My Family ) For business WhatsApp",
      130_000,
    );
    const pool = [
      profile("jennyesber", 4_800_000, "PUBLIC FIGURE ACTRESS JENNY ESBER", 7_000),
      profile("nesreentafesh", 14_900_000, "As above so below", 30_000),
      profile("dima_dalati", 280_600, "Unique Fashion | beauty | lifestyle", 4_000),
      profile("wafamoustafa", 90_200, "Syrian activist and filmmaker", 2_000),
      profile("jamel_alhasan", 2_800_000, "صحفي سوري|| Syrian journalist", 80_000),
    ];

    const kitchen = profile("imadssyriankitchen", 64_800, "Modern Syrian dishes from his home kitchen to London", 200);

    const ranking = buildPeerRanking(target, computeMetrics(target), [...pool, kitchen]);
    const usernames = ranking?.rows.map((row) => row.profile.username) ?? [];
    // Recorded "Account based in" values beat bio signals: Egypt, the UK and an
    // unrecorded country are not Syria, and "Syrian" in a bio is not a location.
    expect(usernames).toEqual(expect.arrayContaining(["yaman.najjar", "dima_dalati", "jennyesber"]));
    // Five rows always: Syria first, then marked fills (Egypt is the same region).
    expect(ranking?.total).toBe(5);
    const byName = new Map(ranking?.rows.map((row) => [row.profile.username, row]));
    expect(byName.get("dima_dalati")?.fill).toBeUndefined();
    expect(byName.get("nesreentafesh")?.fill).toBe("same-region");
    expect(
      ranking?.rows.filter((row) => row.country.country !== "Syria").every((row) => row.fill !== undefined),
    ).toBe(true);
  });
});
