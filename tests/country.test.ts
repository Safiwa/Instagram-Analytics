import { describe, expect, it } from "vitest";
import {
  isMiddleEastAccount,
  countryRelationship,
  hasPublishedCountryEvidence,
  inferCountrySignal,
  isMiddleEastCountry,
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
  it("uses Instagram's published account country before every other signal", () => {
    const signal = inferCountrySignal(
      profile({
        username: "dubai.style",
        accountCountry: "AE",
        bio: "Fashion in Paris",
        recentPosts: [post(["#London"])],
      }),
    );

    expect(signal.country).toBe("United Arab Emirates");
    expect(signal.basis).toBe("account");

    const notShared = inferCountrySignal(
      profile({
        username: "dubai.style",
        accountCountry: "Not shared",
        bio: "Fashion in Paris",
      }),
    );
    expect(notShared.basis).toBe("handle");
  });

  it("uses strong post evidence before the handle when the account country is not shared", () => {
    const signal = inferCountrySignal(
      profile({
        username: "dubai.style",
        accountCountry: null,
        bio: "Fashion in Paris",
        recentPosts: [post(["#London"]), post(["#London"]), post(["#London"])],
      }),
    );

    expect(signal.country).toBe("United Kingdom");
    expect(signal.basis).toBe("posts");
  });

  it("uses the handle before profile text when no country is published in posts", () => {
    const signal = inferCountrySignal(
      profile({
        username: "dubai.style",
        accountCountry: null,
        bio: "Fashion in Paris",
      }),
    );

    expect(signal.country).toBe("United Arab Emirates");
    expect(signal.basis).toBe("handle");
  });

  it("does not treat a country word inside an unrelated word as a match", () => {
    expect(inferCountrySignal(profile({ username: "small.uae" })).country).toBe(
      "United Arab Emirates",
    );
    expect(
      inferCountrySignal(profile({ username: "mall.stories" })).country,
    ).toBeNull();
  });

  it("uses public posts, then the handle, then profile text when no account country is shared", () => {
    const fromProfile = inferCountrySignal(
      profile({ bio: "Food blogger in Amman" }),
    );
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
    expect(
      inferCountrySignal(profile({ username: "visitsyria" })).country,
    ).toBe("Syria");
    expect(
      inferCountrySignal(profile({ username: "explorepalestine" })).country,
    ).toBe("Palestine");
    expect(
      inferCountrySignal(profile({ username: "visitmorocco" })).country,
    ).toBe("Morocco");
    expect(
      inferCountrySignal(profile({ username: "visitlibya" })).country,
    ).toBe("Libya");
    expect(
      inferCountrySignal(profile({ username: "tehran.studio" })).country,
    ).toBe("Iran");
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
    const handles = ["sarahmalas", "randdalati", "lookatsascha"];
    for (const username of handles) {
      const signal = inferCountrySignal(
        profile({ username, bio: "Based in Dubai" }),
      );
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
          {
            ...post(["#vivo", "#Zeiss", "#India"]),
            caption: "Launching on 26th November",
          },
          {
            ...post(["#TechnicalGuruji"]),
            location: "Ladakh, India",
            caption: "War Memorial",
          },
        ],
      }),
    );
    expect(signal.country).toBe("India");
    expect(signal.basis).toBe("posts");
  });

  it("does not read a news topic in a caption as the account country", () => {
    const signal = inferCountrySignal(
      profile({
        username: "arabnews",
        bio: "The Middle East's leading English daily",
        recentPosts: [
          {
            ...post(),
            caption: "Iran says it will use all available means to respond",
          },
          {
            ...post(),
            caption:
              "Tehran and Washington exchange messages through mediators",
          },
        ],
      }),
    );

    expect(signal.country).toBe("Saudi Arabia");
    expect(signal.basis).toBe("curated");
  });

  it("reads compound public hashtags at their edges but never caption topics", () => {
    const signal = inferCountrySignal(
      profile({
        username: "airagymn",
        recentPosts: [
          {
            ...post([
              "#dubaimiraclegarden",
              "#miraclegarden",
              "#dubaireels",
              "#whatsondubai",
            ]),
            caption:
              "Iran and Tehran are the story topic, not the account country.",
          },
          { ...post(["#uaewinter"]), caption: "A winter post." },
          { ...post(["#whatsondubai"]), caption: "A city guide." },
        ],
      }),
    );

    expect(signal.country).toBe("United Arab Emirates");
    expect(signal.basis).toBe("posts");
    expect(hasPublishedCountryEvidence(signal)).toBe(true);

    const middleOnly = inferCountrySignal(
      profile({ username: "sample", recentPosts: [post(["#mydubaistory"])] }),
    );
    expect(middleOnly.country).toBeNull();
  });

  it("keeps @leomessi unpublished when only general caption places are available", () => {
    const signal = inferCountrySignal(
      profile({
        username: "leomessi",
        bio: "Bienvenidos a la cuenta oficial de Instagram de Leo Messi",
        recentPosts: [
          {
            ...post(["#ChatGPT_Partner"]),
            caption:
              "Desde Rosario hasta Miami, y todos los destinos que hay en el medio.",
          },
        ],
      }),
    );

    expect(signal.country).toBeNull();
    expect(signal.label).toBe("Country not published");
  });

  it("uses only a clear majority of promoted locations", () => {
    const clear = inferCountrySignal(
      profile({ recentPosts: [post(["#Doha", "#Qatar"]), post(["#Doha"])] }),
    );
    expect(clear.country).toBe("Qatar");
    expect(clear.basis).toBe("posts");

    const tied = inferCountrySignal(
      profile({
        recentPosts: [post(["#Doha", "#Qatar"]), post(["#Amman", "#Jordan"])],
      }),
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

describe("published Middle East evidence", () => {
  const account: CountrySignal = {
    country: "Lebanon",
    region: "middle-east",
    label: "Lebanon",
    basis: "account",
  };

  it("accepts only exact Middle East countries with a published basis", () => {
    expect(hasPublishedCountryEvidence(account)).toBe(true);
    expect(hasPublishedCountryEvidence({ ...account, basis: "curated" })).toBe(
      false,
    );
    expect(
      hasPublishedCountryEvidence({
        country: null,
        region: "middle-east",
        label: "Middle East",
        basis: "region",
      }),
    ).toBe(false);

    expect(isMiddleEastCountry("Lebanon")).toBe(true);
    expect(isMiddleEastCountry("Libya")).toBe(true);
    expect(isMiddleEastCountry("Iran")).toBe(true);
    expect(isMiddleEastCountry("Turkey")).toBe(false);
    expect(isMiddleEastCountry(null)).toBe(false);
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

describe("Middle East benchmark eligibility", () => {
  const base: CreatorProfile = {
    username: "someone.new",
    displayName: "Someone",
    category: "Creator",
    bio: "",
    followers: 50_000,
    following: 100,
    postsCount: 100,
    isVerified: false,
    source: "public",
    followerHistory: [],
    recentPosts: [],
  };

  it("shows the Middle East panel for Middle East accounts only", () => {
    expect(
      isMiddleEastAccount({ ...base, accountCountry: "United Arab Emirates" }),
    ).toBe(true);
    expect(isMiddleEastAccount({ ...base, accountCountry: "Lebanon" })).toBe(
      true,
    );
    expect(
      isMiddleEastAccount({ ...base, accountCountry: "Saudi Arabia" }),
    ).toBe(true);
    expect(
      isMiddleEastAccount({ ...base, accountCountry: "United States" }),
    ).toBe(false);
    expect(isMiddleEastAccount({ ...base, accountCountry: "India" })).toBe(
      false,
    );
  });

  it("hides it when no country signal exists, unless the handle is a curated Middle East account", () => {
    expect(isMiddleEastAccount({ ...base, username: "natgeo" })).toBe(false);
    expect(isMiddleEastAccount({ ...base, username: "emirates" })).toBe(true);
    expect(isMiddleEastAccount({ ...base, username: "raw.lebanon" })).toBe(
      true,
    );
  });

  it("does not let one trip post outrank the bio's own flag", () => {
    const signal = inferCountrySignal(
      profile({
        username: "part.time.actress",
        accountCountry: null,
        bio: "🇰🇼 part time actress, full time personality",
        recentPosts: [post(["#Jeddah"]), post(["#makeup"])],
      }),
    );
    expect(signal.country).toBe("Kuwait");
    expect(signal.basis).toBe("profile");
  });

  it("reads a 📍 pin before heritage flags", () => {
    const signal = inferCountrySignal(
      profile({
        username: "mixed.heritage",
        accountCountry: null,
        bio: "🇵🇸 Palestinian × Russian 🇷🇺 📍Dubai | 📩 hello@example.com",
      }),
    );
    expect(signal.country).toBe("United Arab Emirates");
  });

  it("uses recorded Account based in values for @ascia and @rima_alosta", () => {
    expect(inferCountrySignal(profile({ username: "ascia", accountCountry: null, bio: "" })).country).toBe("Kuwait");
    expect(inferCountrySignal(profile({ username: "rima_alosta", accountCountry: null, bio: "📍Dubai" })).country).toBe(
      "Russia",
    );
  });
});
