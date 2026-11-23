import { MIDDLE_EAST_COUNTRIES, regionForHandle, type Region } from "../data/regions";
import type { CreatorProfile } from "../data/types";

// Instagram's "Account based in" value wins when it is shared. When it is not
// shared, public post/reel locations, hashtags and captions come before the
// remaining public text signals and curated metadata. None of these values are
// audience demographics. Curated-only attribution is marked with the "curated"
// basis so country boards can require published evidence.
export type CountryBasis = "account" | "handle" | "profile" | "posts" | "curated" | "region";

export type CountrySignal = {
  country: string | null;
  region: Region | null;
  label: string;
  basis: CountryBasis | null;
};

type CountryRule = {
  country: string;
  region: Region | null;
  aliases: string[];
  handleAliases?: string[];
  flag?: string;
  code?: string;
};

const COUNTRY_RULES: CountryRule[] = [
  {
    country: "United Arab Emirates",
    region: "uae",
    flag: "🇦🇪",
    code: "AE",
    aliases: [
      "united arab emirates",
      "uae",
      "u a e",
      "dubai",
      "dxb",
      "abu dhabi",
      "abudhabi",
      "sharjah",
      "jumeirah",
      "emirati",
    ],
    handleAliases: ["uae", "dubai", "dxb", "abudhabi", "sharjah", "jumeirah"],
  },
  {
    country: "Saudi Arabia",
    region: "middle-east",
    flag: "🇸🇦",
    code: "SA",
    aliases: ["saudi arabia", "saudi", "ksa", "riyadh", "jeddah", "makkah", "medina"],
    handleAliases: ["saudi", "ksa", "riyadh", "jeddah"],
  },
  {
    country: "Qatar",
    region: "middle-east",
    flag: "🇶🇦",
    code: "QA",
    aliases: ["qatar", "doha"],
    handleAliases: ["qatar", "doha"],
  },
  {
    country: "Jordan",
    region: "middle-east",
    flag: "🇯🇴",
    code: "JO",
    aliases: ["jordan", "amman"],
    handleAliases: ["jordan", "amman"],
  },
  {
    country: "Kuwait",
    region: "middle-east",
    flag: "🇰🇼",
    code: "KW",
    aliases: ["kuwait"],
    handleAliases: ["kuwait"],
  },
  {
    country: "Bahrain",
    region: "middle-east",
    flag: "🇧🇭",
    code: "BH",
    aliases: ["bahrain", "manama"],
    handleAliases: ["bahrain", "manama"],
  },
  {
    country: "Oman",
    region: "middle-east",
    flag: "🇴🇲",
    code: "OM",
    aliases: ["oman", "muscat"],
    handleAliases: ["oman", "muscat"],
  },
  {
    country: "Lebanon",
    region: "middle-east",
    flag: "🇱🇧",
    code: "LB",
    aliases: ["lebanon", "beirut"],
    handleAliases: ["lebanon", "beirut"],
  },
  {
    country: "Egypt",
    region: "middle-east",
    flag: "🇪🇬",
    code: "EG",
    aliases: ["egypt", "cairo"],
    handleAliases: ["egypt", "cairo"],
  },
  {
    country: "Syria",
    region: "middle-east",
    flag: "🇸🇾",
    code: "SY",
    aliases: ["syria", "damascus"],
    handleAliases: ["syria", "damascus"],
  },
  {
    country: "Iraq",
    region: "middle-east",
    flag: "🇮🇶",
    code: "IQ",
    aliases: ["iraq", "baghdad"],
    handleAliases: ["iraq", "baghdad"],
  },
  {
    country: "Palestine",
    region: "middle-east",
    flag: "🇵🇸",
    code: "PS",
    aliases: ["palestine", "palestinian", "ramallah", "gaza"],
    handleAliases: ["palestine", "ramallah", "gaza"],
  },
  {
    country: "Tunisia",
    region: "middle-east",
    flag: "🇹🇳",
    code: "TN",
    aliases: ["tunisia", "tunis"],
    handleAliases: ["tunisia", "tunis"],
  },
  {
    country: "Morocco",
    region: "middle-east",
    flag: "🇲🇦",
    code: "MA",
    aliases: ["morocco", "moroccan", "casablanca", "marrakech"],
    handleAliases: ["morocco", "casablanca", "marrakech"],
  },
  {
    country: "Libya",
    region: "middle-east",
    flag: "🇱🇾",
    code: "LY",
    aliases: ["libya", "libyan", "tripoli", "benghazi"],
    handleAliases: ["libya", "tripoli", "benghazi"],
  },
  {
    country: "Iran",
    region: "middle-east",
    flag: "🇮🇷",
    code: "IR",
    aliases: ["iran", "iranian", "tehran"],
    handleAliases: ["iran", "tehran"],
  },
  {
    country: "United States",
    region: "usa",
    flag: "🇺🇸",
    code: "US",
    aliases: [
      "united states",
      "united states of america",
      "usa",
      "new york",
      "los angeles",
      "california",
      "miami",
      "texas",
    ],
    handleAliases: ["usa", "america", "newyork", "nyc", "losangeles", "miami"],
  },
  {
    country: "United Kingdom",
    region: "europe",
    flag: "🇬🇧",
    code: "GB",
    aliases: ["united kingdom", "uk", "london", "england"],
    handleAliases: ["uk", "london"],
  },
  {
    country: "Italy",
    region: "europe",
    flag: "🇮🇹",
    code: "IT",
    aliases: ["italy", "italia", "milan"],
    handleAliases: ["italy", "milan"],
  },
  {
    country: "France",
    region: "europe",
    flag: "🇫🇷",
    code: "FR",
    aliases: ["france", "paris"],
    handleAliases: ["france", "paris"],
  },
  {
    country: "Spain",
    region: "europe",
    flag: "🇪🇸",
    code: "ES",
    aliases: ["spain", "madrid", "barcelona"],
    handleAliases: ["spain", "madrid", "barcelona"],
  },
  {
    country: "Germany",
    region: "europe",
    flag: "🇩🇪",
    code: "DE",
    aliases: ["germany", "berlin", "munich"],
    handleAliases: ["germany", "berlin"],
  },
  {
    country: "Portugal",
    region: "europe",
    flag: "🇵🇹",
    code: "PT",
    aliases: ["portugal", "lisbon"],
    handleAliases: ["portugal", "lisbon"],
  },
  {
    country: "Brazil",
    region: null,
    flag: "🇧🇷",
    code: "BR",
    aliases: ["brazil", "brasil", "sao paulo", "saopaulo", "rio de janeiro"],
    handleAliases: ["brazil", "brasil", "saopaulo"],
  },
  {
    country: "India",
    region: null,
    flag: "🇮🇳",
    code: "IN",
    aliases: ["india", "mumbai", "delhi", "bangalore"],
    handleAliases: ["india", "mumbai", "delhi"],
  },
];

// Curated account country, used only when Instagram's "Account based in" and
// the public handle, profile and post signals all leave the country unresolved.
// It is editorial metadata, not Instagram audience data, and is marked with the
// "curated" basis.
const CURATED_COUNTRY_BY_HANDLE: Record<string, string> = {
  qatarairways: "Qatar",
  visitqatar: "Qatar",
  qatar: "Qatar",
  arabnews: "Saudi Arabia",
  visitsaudi: "Saudi Arabia",
  flynas: "Saudi Arabia",
  visitjordan: "Jordan",
  visitsyria: "Syria",
  visitiraq: "Iraq",
  explorepalestine: "Palestine",
  visitkuwait: "Kuwait",
  visitegypt: "Egypt",
  visitlebanon: "Lebanon",
  visitbahrain: "Bahrain",
  visitoman: "Oman",
  visittunisia: "Tunisia",
  visitmorocco: "Morocco",
  chiaraferragni: "Italy",
  gucci: "Italy",
  davidguetta: "France",
  psg: "France",
  sofiamcoelho: "Portugal",
  cristiano: "Portugal",
  zoella: "United Kingdom",
  premierleague: "United Kingdom",
  fcbarcelona: "Spain",
  realmadrid: "Spain",
  adidas: "Germany",
  alisha_sajjal: "United Arab Emirates",
  alitofique: "United Arab Emirates",
  amrmaskoun: "United Arab Emirates",
  hinaashh: "United Arab Emirates",
  jexmi: "United Arab Emirates",
  donya_esmailiii: "United Arab Emirates",
  aiamwa: "United Arab Emirates",
  dina_h_ussien: "United Arab Emirates",
  poojaabis: "United Arab Emirates",
  taranum_sshahin: "United Arab Emirates",
  "dina.ak": "United Arab Emirates",
  anshi_pandyala_official: "United Arab Emirates",
  zeniamk: "United Arab Emirates",
  // Real public UAE creator accounts in @amrmaskoun's 4–7M follower band.
  baneenstars: "United Arab Emirates",
  taimalfalasi: "United Arab Emirates",
  wessamq: "United Arab Emirates",
  // Real public UAE creator accounts in @alaaabuharb's 1.7–3.1M follower band.
  sarahmalas: "United Arab Emirates",
  randdalati: "United Arab Emirates",
  rima_alosta: "United Arab Emirates",
  lookatsascha: "United Arab Emirates",
  khalus_recipes: "United Arab Emirates",
  ladyandhersweetescapes: "United Arab Emirates",
  airagymn: "United Arab Emirates",
  elsakahwaji: "Lebanon",
};

const REGION_COUNTRY: Partial<Record<Region, string>> = {
  usa: "United States",
  uae: "United Arab Emirates",
};

const REGION_LABEL: Record<Region, string> = {
  usa: "United States",
  europe: "Europe",
  "middle-east": "Middle East",
  uae: "UAE",
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasNormalizedAlias(text: string, alias: string): boolean {
  const needle = normalize(alias);
  if (!needle) {
    return false;
  }
  return new RegExp(`(^| )${escapeRegExp(needle)}( |$)`).test(text);
}

function hasHandleAlias(handle: string, alias: string): boolean {
  const needle = compact(alias);
  if (!needle) {
    return false;
  }
  const bounded = new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}($|[^a-z0-9])`).test(handle);
  // Handles often concatenate words (dubaimall, qatarairways, visitqatar). A
  // country cue at either edge still counts, but never a bare substring like
  // "mall" inside "small".
  return bounded || (needle.length >= 4 && (handle.startsWith(needle) || handle.endsWith(needle)));
}

function hasCompoundAlias(value: string, alias: string): boolean {
  const needle = compact(alias);
  const compactValue = compact(value);
  // Public hashtags are often compound words (#dubaimiraclegarden, #uaewinter,
  // #whatsondubai) rather than tokenized text. A country cue at either edge is
  // explicit; a bare substring in the middle still is not. Three letters are
  // enough for codes such as UAE/DXB, but not for ambiguous two-letter bits.
  return (
    needle.length >= 3 &&
    compactValue.length > 0 &&
    (compactValue.startsWith(needle) || compactValue.endsWith(needle))
  );
}

// Emoji flags survive public profile/caption text even when the country name is
// translated. `normalize()` strips them, so they must be checked before the text
// aliases. When several flags appear, the rule order decides, with the UAE first;
// explicit account-country and post signals are checked before this text.
function matchCountryFlag(text: string): CountryRule | null {
  for (const rule of COUNTRY_RULES) {
    if (rule.flag && text.includes(rule.flag)) {
      return rule;
    }
  }
  return null;
}

function matchCountry(
  matcher: (alias: string) => boolean,
  source: "handle" | "text" = "text",
): CountryRule | null {
  for (const rule of COUNTRY_RULES) {
    const aliases = source === "handle" ? (rule.handleAliases ?? rule.aliases) : rule.aliases;
    if (aliases.some(matcher)) {
      return rule;
    }
  }
  return null;
}

function signal(
  rule: CountryRule | null,
  region: Region | null,
  basis: CountryBasis | null,
): CountrySignal {
  if (rule) {
    return { country: rule.country, region: rule.region, label: rule.country, basis };
  }
  if (region) {
    return { country: null, region, label: REGION_LABEL[region], basis: basis ?? "region" };
  }
  return { country: null, region: null, label: "Country not published", basis: null };
}

function countryRuleForCountry(country: string): CountryRule | null {
  return COUNTRY_RULES.find((entry) => entry.country === country) ?? null;
}

// Canonicalizes Instagram's published "Account based in" name or ISO code. Only
// known countries are accepted so viewer-locale fields such as `country_code`
// can never be mistaken for an account country.
export function normalizePublishedCountry(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || /not shared|not available|unknown|unspecified|none/i.test(trimmed)) {
    return null;
  }

  const compactValue = compact(trimmed).toUpperCase();
  const byCode = COUNTRY_RULES.find((rule) => rule.code === compactValue);
  if (byCode) {
    return byCode.country;
  }

  const normalizedValue = normalize(trimmed);
  const byAlias = COUNTRY_RULES.find(
    (rule) =>
      rule.country.toLowerCase() === normalizedValue ||
      rule.aliases.some((alias) => normalize(alias) === normalizedValue),
  );
  return byAlias?.country ?? null;
}

// Only public evidence qualifies for the Middle East and UAE boards. Handle,
// profile, post and explicit account-country signals are published; curated
// metadata and region membership are editorial fallbacks.
export function hasPublishedCountryEvidence(signal: CountrySignal): boolean {
  return (
    signal.country !== null &&
    (signal.basis === "account" ||
      signal.basis === "handle" ||
      signal.basis === "profile" ||
      signal.basis === "posts")
  );
}

export function isMiddleEastCountry(country: string | null | undefined): boolean {
  return Boolean(
    country && MIDDLE_EAST_COUNTRIES.includes(country as (typeof MIDDLE_EAST_COUNTRIES)[number]),
  );
}

// Count one vote per post per detected country. Only explicit location tags,
// hashtags and location flags count: a news caption that mentions a country as
// a story topic is not the account's country. A post that promotes two
// countries contributes one vote to each, so a single hashtag-stuffed post
// cannot outweigh a clear majority across the public recent posts.
function postCountryVotes(profile: CreatorProfile): Map<string, number> {
  const votes = new Map<string, number>();

  for (const post of profile.recentPosts) {
    const countries = new Set<string>();
    const flagText = [post.caption, post.location ?? "", ...post.hashtags].join(" ");

    for (const rule of COUNTRY_RULES) {
      if (rule.flag && flagText.includes(rule.flag)) {
        countries.add(rule.country);
      }
    }

    const promotedValues = [post.location ?? "", ...post.hashtags].filter(Boolean);
    const promoted = normalize(promotedValues.join(" "));
    for (const rule of COUNTRY_RULES) {
      const matched = rule.aliases.some(
        (alias) =>
          hasNormalizedAlias(promoted, alias) ||
          promotedValues.some((value) => hasCompoundAlias(value, alias)),
      );
      if (matched) {
        countries.add(rule.country);
      }
    }

    for (const country of countries) {
      votes.set(country, (votes.get(country) ?? 0) + 1);
    }
  }

  return votes;
}

// Only a clear majority of promoted locations is treated as public evidence.
// Mixed or tied signals stay unresolved instead of picking a country by rule
// order. This is what keeps content from one country out of another's board.
function dominantPostCountry(profile: CreatorProfile): CountryRule | null {
  const votes = [...postCountryVotes(profile)].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  );
  if (votes.length === 0) {
    return null;
  }
  if (votes.length > 1 && votes[0][1] === votes[1][1]) {
    return null;
  }
  return countryRuleForCountry(votes[0][0]);
}

export function inferCountrySignal(profile: CreatorProfile): CountrySignal {
  const username = profile.username.toLowerCase();
  const region = regionForHandle(username);

  // Instagram's own transparency value is authoritative when it is shared.
  const accountCountry = normalizePublishedCountry(profile.accountCountry);
  const accountRule = accountCountry ? countryRuleForCountry(accountCountry) : null;
  if (accountRule) {
    return signal(accountRule, region, "account");
  }

  // If it is not shared, the public posts and reels are the next requested
  // source: their location tags, hashtags and location flags count as votes.
  const postMatch = dominantPostCountry(profile);
  if (postMatch) {
    return signal(postMatch, region, "posts");
  }

  const handleMatch = matchCountry((alias) => hasHandleAlias(username, alias), "handle");
  if (handleMatch) {
    return signal(handleMatch, region, "handle");
  }

  const profileTextRaw = `${profile.displayName} ${profile.bio} ${profile.website ?? ""}`;
  const profileFlagMatch = matchCountryFlag(profileTextRaw);
  if (profileFlagMatch) {
    return signal(profileFlagMatch, region, "profile");
  }
  const profileText = normalize(profileTextRaw);
  const profileMatch = matchCountry((alias) => hasNormalizedAlias(profileText, alias));
  if (profileMatch) {
    return signal(profileMatch, region, "profile");
  }

  const curatedCountry =
    CURATED_COUNTRY_BY_HANDLE[username] ?? (region ? REGION_COUNTRY[region] : undefined);
  if (curatedCountry) {
    return signal(countryRuleForCountry(curatedCountry), region, "curated");
  }

  return signal(null, region, region ? "region" : null);
}

export type CountryRelationship =
  | "same-country"
  | "same-region"
  | "country-unknown"
  | "different-country";

function sameBoardRegion(target: Region | null, candidate: Region | null): boolean {
  if (!target || !candidate) {
    return false;
  }
  if (target === candidate) {
    return true;
  }
  // The Middle East board includes the UAE as well as the rest of the region.
  const middleEast = new Set<Region>(["middle-east", "uae"]);
  return middleEast.has(target) && middleEast.has(candidate);
}

export function countryRelationship(
  target: CountrySignal,
  candidate: CountrySignal,
): CountryRelationship {
  if (target.country && candidate.country) {
    if (target.country === candidate.country) {
      return "same-country";
    }
    if (sameBoardRegion(target.region, candidate.region)) {
      return "same-region";
    }
    return "different-country";
  }
  if (sameBoardRegion(target.region, candidate.region)) {
    return "same-region";
  }
  return "country-unknown";
}

export function countryTier(relationship: CountryRelationship): number {
  switch (relationship) {
    case "same-country":
      return 0;
    case "same-region":
      return 1;
    case "country-unknown":
      return 2;
    case "different-country":
      return 3;
  }
}

export function countryScore(relationship: CountryRelationship): number {
  switch (relationship) {
    case "same-country":
      return 100;
    case "same-region":
      return 80;
    case "country-unknown":
      return 60;
    case "different-country":
      return 20;
  }
}

export function countryReason(
  relationship: CountryRelationship,
  target: CountrySignal,
  candidate: CountrySignal,
): string {
  switch (relationship) {
    case "same-country":
      return `same country (${candidate.label})`;
    case "same-region":
      return `same region (${candidate.label})`;
    case "country-unknown":
      return "country not published on Instagram";
    case "different-country":
      return `different country signal (${candidate.label})`;
  }
}
