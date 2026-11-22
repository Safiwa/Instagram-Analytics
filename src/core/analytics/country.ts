import { regionForHandle, type Region } from "../data/regions";
import type { CreatorProfile } from "../data/types";

// Instagram does not publish an account's country. These signals are inferred
// from public text and curated handle metadata, and are never presented as
// audience demographics. The order is deliberate: handle/curated account data
// first, then public profile text, then hashtags and captions that promote a
// location.
export type CountryBasis = "handle" | "profile" | "posts" | "region";

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
};

const COUNTRY_RULES: CountryRule[] = [
  {
    country: "United Arab Emirates",
    region: "uae",
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
    aliases: ["saudi arabia", "saudi", "ksa", "riyadh", "jeddah", "makkah", "medina"],
    handleAliases: ["saudi", "ksa", "riyadh", "jeddah"],
  },
  { country: "Qatar", region: "middle-east", aliases: ["qatar", "doha"], handleAliases: ["qatar", "doha"] },
  { country: "Jordan", region: "middle-east", aliases: ["jordan", "amman"], handleAliases: ["jordan", "amman"] },
  { country: "Kuwait", region: "middle-east", aliases: ["kuwait"], handleAliases: ["kuwait"] },
  { country: "Bahrain", region: "middle-east", aliases: ["bahrain", "manama"], handleAliases: ["bahrain", "manama"] },
  { country: "Oman", region: "middle-east", aliases: ["oman", "muscat"], handleAliases: ["oman", "muscat"] },
  { country: "Lebanon", region: "middle-east", aliases: ["lebanon", "beirut"], handleAliases: ["lebanon", "beirut"] },
  { country: "Egypt", region: "middle-east", aliases: ["egypt", "cairo"], handleAliases: ["egypt", "cairo"] },
  { country: "Syria", region: "middle-east", aliases: ["syria", "damascus"], handleAliases: ["syria", "damascus"] },
  { country: "Iraq", region: "middle-east", aliases: ["iraq", "baghdad"], handleAliases: ["iraq", "baghdad"] },
  {
    country: "Palestine",
    region: "middle-east",
    aliases: ["palestine", "palestinian", "ramallah", "gaza"],
    handleAliases: ["palestine", "ramallah", "gaza"],
  },
  { country: "Tunisia", region: "middle-east", aliases: ["tunisia", "tunis"], handleAliases: ["tunisia", "tunis"] },
  {
    country: "Morocco",
    region: "middle-east",
    aliases: ["morocco", "moroccan", "casablanca", "marrakech"],
    handleAliases: ["morocco", "casablanca", "marrakech"],
  },
  {
    country: "United States",
    region: "usa",
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
    aliases: ["united kingdom", "uk", "london", "england"],
    handleAliases: ["uk", "london"],
  },
  { country: "Italy", region: "europe", aliases: ["italy", "italia", "milan"], handleAliases: ["italy", "milan"] },
  { country: "France", region: "europe", aliases: ["france", "paris"], handleAliases: ["france", "paris"] },
  { country: "Spain", region: "europe", aliases: ["spain", "madrid", "barcelona"], handleAliases: ["spain", "madrid", "barcelona"] },
  { country: "Germany", region: "europe", aliases: ["germany", "berlin", "munich"], handleAliases: ["germany", "berlin"] },
  { country: "Portugal", region: "europe", aliases: ["portugal", "lisbon"], handleAliases: ["portugal", "lisbon"] },
  {
    country: "Brazil",
    region: null,
    aliases: ["brazil", "brasil", "sao paulo", "saopaulo", "rio de janeiro"],
    handleAliases: ["brazil", "brasil", "saopaulo"],
  },
  {
    country: "India",
    region: null,
    aliases: ["india", "mumbai", "delhi", "bangalore"],
    handleAliases: ["india", "mumbai", "delhi"],
  },
];

// Curated published account country, used only when the handle itself does not
// contain a country word. It is editorial metadata, not Instagram audience data.
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

export function inferCountrySignal(profile: CreatorProfile): CountrySignal {
  const username = profile.username.toLowerCase();
  const region = regionForHandle(username);
  const curatedCountry =
    CURATED_COUNTRY_BY_HANDLE[username] ?? (region ? REGION_COUNTRY[region] : undefined);

  if (curatedCountry) {
    const rule = COUNTRY_RULES.find((entry) => entry.country === curatedCountry) ?? null;
    return signal(rule, region, "handle");
  }

  const handleMatch = matchCountry((alias) => hasHandleAlias(username, alias), "handle");
  if (handleMatch) {
    return signal(handleMatch, region, "handle");
  }

  const profileText = normalize(
    `${profile.displayName} ${profile.bio} ${profile.website ?? ""}`,
  );
  const profileMatch = matchCountry((alias) => hasNormalizedAlias(profileText, alias));
  if (profileMatch) {
    return signal(profileMatch, region, "profile");
  }

  // Captions and hashtags are used as promoted-location signals, not as proof
  // of residence. That is why this is the last fallback.
  const postText = normalize(
    profile.recentPosts
      .flatMap((post) => [post.caption, ...post.hashtags])
      .join(" "),
  );
  const postMatch = matchCountry((alias) => hasNormalizedAlias(postText, alias));
  if (postMatch) {
    return signal(postMatch, region, "posts");
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
