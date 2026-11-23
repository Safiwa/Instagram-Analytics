import { regionForHandle, type Region } from "../data/regions";
import type { CreatorProfile } from "../data/types";

// Instagram does not publish an account's country. These signals are inferred
// from public text first, then curated handle metadata, and are never presented
// as audience demographics. The order is deliberate: public handle and profile
// text, then a clear majority of hashtag/caption locations, then curated
// metadata. Curated-only attribution is marked with the "curated" basis so
// country boards can require public evidence.
export type CountryBasis = "handle" | "profile" | "posts" | "curated" | "region";

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
};

const COUNTRY_RULES: CountryRule[] = [
  {
    country: "United Arab Emirates",
    region: "uae",
    flag: "🇦🇪",
    aliases: [
      "united arab emirates",
      "uae",
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
    aliases: ["saudi arabia", "saudi", "ksa", "riyadh", "jeddah", "makkah", "medina"],
    handleAliases: ["saudi", "ksa", "riyadh", "jeddah"],
  },
  {
    country: "Qatar",
    region: "middle-east",
    flag: "🇶🇦",
    aliases: ["qatar", "doha"],
    handleAliases: ["qatar", "doha"],
  },
  {
    country: "Jordan",
    region: "middle-east",
    flag: "🇯🇴",
    aliases: ["jordan", "amman"],
    handleAliases: ["jordan", "amman"],
  },
  { country: "Kuwait", region: "middle-east", flag: "🇰🇼", aliases: ["kuwait"], handleAliases: ["kuwait"] },
  {
    country: "Bahrain",
    region: "middle-east",
    flag: "🇧🇭",
    aliases: ["bahrain", "manama"],
    handleAliases: ["bahrain", "manama"],
  },
  {
    country: "Oman",
    region: "middle-east",
    flag: "🇴🇲",
    aliases: ["oman", "muscat"],
    handleAliases: ["oman", "muscat"],
  },
  {
    country: "Lebanon",
    region: "middle-east",
    flag: "🇱🇧",
    aliases: ["lebanon", "beirut"],
    handleAliases: ["lebanon", "beirut"],
  },
  {
    country: "Egypt",
    region: "middle-east",
    flag: "🇪🇬",
    aliases: ["egypt", "cairo"],
    handleAliases: ["egypt", "cairo"],
  },
  {
    country: "Syria",
    region: "middle-east",
    flag: "🇸🇾",
    aliases: ["syria", "damascus"],
    handleAliases: ["syria", "damascus"],
  },
  {
    country: "Iraq",
    region: "middle-east",
    flag: "🇮🇶",
    aliases: ["iraq", "baghdad"],
    handleAliases: ["iraq", "baghdad"],
  },
  {
    country: "Palestine",
    region: "middle-east",
    flag: "🇵🇸",
    aliases: ["palestine", "palestinian", "ramallah", "gaza"],
    handleAliases: ["palestine", "ramallah", "gaza"],
  },
  {
    country: "Tunisia",
    region: "middle-east",
    flag: "🇹🇳",
    aliases: ["tunisia", "tunis"],
    handleAliases: ["tunisia", "tunis"],
  },
  {
    country: "Morocco",
    region: "middle-east",
    flag: "🇲🇦",
    aliases: ["morocco", "moroccan", "casablanca", "marrakech"],
    handleAliases: ["morocco", "casablanca", "marrakech"],
  },
  {
    country: "Libya",
    region: "middle-east",
    flag: "🇱🇾",
    aliases: ["libya", "libyan", "tripoli", "benghazi"],
    handleAliases: ["libya", "tripoli", "benghazi"],
  },
  {
    country: "Iran",
    region: "middle-east",
    flag: "🇮🇷",
    aliases: ["iran", "iranian", "tehran"],
    handleAliases: ["iran", "tehran"],
  },
  {
    country: "United States",
    region: "usa",
    flag: "🇺🇸",
    aliases: [
      "united states",
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
    aliases: ["united kingdom", "uk", "london", "england"],
    handleAliases: ["uk", "london"],
  },
  {
    country: "Italy",
    region: "europe",
    flag: "🇮🇹",
    aliases: ["italy", "italia", "milan"],
    handleAliases: ["italy", "milan"],
  },
  {
    country: "France",
    region: "europe",
    flag: "🇫🇷",
    aliases: ["france", "paris"],
    handleAliases: ["france", "paris"],
  },
  {
    country: "Spain",
    region: "europe",
    flag: "🇪🇸",
    aliases: ["spain", "madrid", "barcelona"],
    handleAliases: ["spain", "madrid", "barcelona"],
  },
  {
    country: "Germany",
    region: "europe",
    flag: "🇩🇪",
    aliases: ["germany", "berlin", "munich"],
    handleAliases: ["germany", "berlin"],
  },
  {
    country: "Portugal",
    region: "europe",
    flag: "🇵🇹",
    aliases: ["portugal", "lisbon"],
    handleAliases: ["portugal", "lisbon"],
  },
  {
    country: "Brazil",
    region: null,
    flag: "🇧🇷",
    aliases: ["brazil", "brasil", "sao paulo", "saopaulo", "rio de janeiro"],
    handleAliases: ["brazil", "brasil", "saopaulo"],
  },
  {
    country: "India",
    region: null,
    flag: "🇮🇳",
    aliases: ["india", "mumbai", "delhi", "bangalore"],
    handleAliases: ["india", "mumbai", "delhi"],
  },
];

// Curated published account country, used only when no public handle, profile
// or post signal resolves a country. It is editorial metadata, not Instagram
// audience data, and is marked with the "curated" basis.
const CURATED_COUNTRY_BY_HANDLE: Record<string, string> = {
  qatarairways: "Qatar",
  visitqatar: "Qatar",
  qatar: "Qatar",
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

// Emoji flags survive public profile/caption text even when the country name is
// translated. `normalize()` strips them, so they must be checked before the text
// aliases. When several flags appear, the rule order decides, with the UAE first;
// public handle signals still win before any profile or post text.
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

// Count one vote per post per detected country. A post that mentions two
// countries contributes one vote to each, so a single hashtag-stuffed post
// cannot outweigh a clear majority across the public recent posts.
function postCountryVotes(profile: CreatorProfile): Map<string, number> {
  const votes = new Map<string, number>();

  for (const post of profile.recentPosts) {
    const raw = [post.caption, ...post.hashtags].join(" ");
    const countries = new Set<string>();

    for (const rule of COUNTRY_RULES) {
      if (rule.flag && raw.includes(rule.flag)) {
        countries.add(rule.country);
      }
    }

    const text = normalize(raw);
    for (const rule of COUNTRY_RULES) {
      if (rule.aliases.some((alias) => hasNormalizedAlias(text, alias))) {
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

  // Captions and hashtags are used as promoted-location signals, not as proof
  // of residence. They only count when one country has a clear majority and
  // are checked after explicit handle and profile text.
  const postMatch = dominantPostCountry(profile);
  if (postMatch) {
    return signal(postMatch, region, "posts");
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
