import { describe, expect, it } from "vitest";
import {
  countryRelationship,
  inferCountrySignal,
  type CountrySignal,
} from "../src/core/analytics/country";
import type { CreatorProfile, Post } from "../src/core/data/types";

function post(hashtags: string[] = []): Post {
  return {
    id: "p",
    type: "Reel",
    caption: hashtags.join(" "),
    postedAt: new Date("2026-11-20T00:00:00.000Z").toISOString(),
    likes: 100,
    comments: 10,
    hashtags,
  };
}

function profile(overrides: Partial<CreatorProfile> = {}): CreatorProfile {
  return {
    username: "sample",
    displayName: "Sample",
    category: "Digital creator",
    bio: "",
    followers: 10_000,
    following: 100,
    postsCount: 10,
    isVerified: false,
    source: "live",
    followerHistory: [],
    recentPosts: [],
    ...overrides,
  };
}

describe("country signal inference", () => {
  it("reads a country word from the handle before any other text", () => {
    const signal = inferCountrySignal(
      profile({
        username: "dubai.style",
        bio: "Fashion in Paris",
        recentPosts: [post(["#London"])],
      }),
    );

    expect(signal.country).toBe("United Arab Emirates");
    expect(signal.basis).toBe("handle");
  });

  it("does not treat a country word inside an unrelated word as a match", () => {
    expect(inferCountrySignal(profile({ username: "small.uae" })).country).toBe(
      "United Arab Emirates",
    );
    expect(inferCountrySignal(profile({ username: "mall.stories" })).country).toBeNull();
  });

  it("falls back to profile text, then promoted hashtags and captions", () => {
    const fromProfile = inferCountrySignal(profile({ bio: "Food blogger in Amman" }));
    expect(fromProfile.country).toBe("Jordan");
    expect(fromProfile.basis).toBe("profile");

    const fromPosts = inferCountrySignal(
      profile({ recentPosts: [post(["#Doha", "#Qatar"])] }),
    );
    expect(fromPosts.country).toBe("Qatar");
    expect(fromPosts.basis).toBe("posts");
  });

  it("reads public country flags before translated country words", () => {
    const fromProfile = inferCountrySignal(
      profile({ bio: "Foodie in 🇦🇪 — Paris, Amman" }),
    );
    expect(fromProfile.country).toBe("United Arab Emirates");
    expect(fromProfile.basis).toBe("profile");

    const fromPosts = inferCountrySignal(
      profile({ recentPosts: [{ ...post(), caption: "Dubai nights 🇦🇪" }] }),
    );
    expect(fromPosts.country).toBe("United Arab Emirates");
    expect(fromPosts.basis).toBe("posts");
  });

  it("maps public Middle East handle words to their country", () => {
    expect(inferCountrySignal(profile({ username: "visitsyria" })).country).toBe("Syria");
    expect(inferCountrySignal(profile({ username: "explorepalestine" })).country).toBe(
      "Palestine",
    );
    expect(inferCountrySignal(profile({ username: "visitmorocco" })).country).toBe("Morocco");
    expect(inferCountrySignal(profile({ username: "visitlibya" })).country).toBe("Libya");
    expect(inferCountrySignal(profile({ username: "tehran.studio" })).country).toBe("Iran");
  });

  it("marks curated-only attribution so country boards can require public evidence", () => {
    const signal = inferCountrySignal(profile({ username: "emirates" }));
    expect(signal.country).toBe("United Arab Emirates");
    expect(signal.basis).toBe("curated");
  });

  it("resolves the real UAE creator band around @amrmaskoun", () => {
    const handles = ["amrmaskoun", "wessamq", "taimalfalasi", "baneenstars"];
    for (const username of handles) {
      const signal = inferCountrySignal(
        profile({ username, bio: "Founder and actor 🇸🇾 🇫🇷 🇦🇪" }),
      );
      expect(signal.country).toBe("United Arab Emirates");
      expect(signal.region).toBe("uae");
      expect(signal.basis).toBe("profile");
    }
  });

  it("resolves the real UAE creator band around @alaaabuharb", () => {
    const handles = ["sarahmalas", "randdalati", "rima_alosta", "lookatsascha"];
    for (const username of handles) {
      const signal = inferCountrySignal(profile({ username, bio: "Based in Dubai" }));
      expect(signal.country).toBe("United Arab Emirates");
      expect(signal.region).toBe("uae");
      expect(signal.basis).toBe("profile");
    }
  });

  it("does not infer the UAE for @technicalguruji from India-promoting content", () => {
    const signal = inferCountrySignal(
      profile({
        username: "technicalguruji",
        bio: "Engineer by Education, Entrepreneur by Profession",
        recentPosts: [
          post(["#TechnicalGuruji", "#TGFamily"]),
          { ...post(["#vivo", "#Zeiss"]), caption: "Launching in India on 26th November" },
          { ...post(["#TechnicalGuruji"]), caption: "War Memorial in Ladakh" },
        ],
      }),
    );
    expect(signal.country).toBe("India");
    expect(signal.basis).toBe("posts");
  });

  it("uses only a clear majority of promoted locations", () => {
    const clear = inferCountrySignal(
      profile({ recentPosts: [post(["#Doha", "#Qatar"]), post(["#Doha"])] }),
    );
    expect(clear.country).toBe("Qatar");
    expect(clear.basis).toBe("posts");

    const tied = inferCountrySignal(
      profile({ recentPosts: [post(["#Doha", "#Qatar"]), post(["#Amman", "#Jordan"])] }),
    );
    expect(tied.country).toBeNull();
    expect(tied.basis).toBeNull();
  });

  it("keeps region-only signals when no country is published", () => {
    const signal = inferCountrySignal(profile({ username: "aljazeera" }));
    expect(signal.country).toBeNull();
    expect(signal.region).toBe("middle-east");
    expect(signal.label).toBe("Middle East");
  });
});

describe("country relationships", () => {
  const uae: CountrySignal = {
    country: "United Arab Emirates",
    region: "uae",
    label: "United Arab Emirates",
    basis: "handle",
  };
  const qatar: CountrySignal = {
    country: "Qatar",
    region: "middle-east",
    label: "Qatar",
    basis: "handle",
  };
  const unknown: CountrySignal = {
    country: null,
    region: null,
    label: "Country not published",
    basis: null,
  };

  it("distinguishes same country, same region, unknown and different", () => {
    expect(countryRelationship(uae, uae)).toBe("same-country");
    expect(countryRelationship(uae, qatar)).toBe("same-region");
    expect(countryRelationship(uae, unknown)).toBe("country-unknown");
    expect(
      countryRelationship(uae, {
        ...qatar,
        region: "europe",
      }),
    ).toBe("different-country");
  });
});
