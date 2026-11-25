import type { CreatorProfile } from "../data/types";

// Instagram-style account categories. The first block is the set of creator
// categories the product benchmarks explicitly; the rest cover the brands and
// media accounts that also appear in the tracked pool.
export const CREATOR_CATEGORIES = [
  "Digital creator",
  "Blogger",
  "Personal blog",
  "Public figure",
  "Reel/Video creator",
  "Content creator",
  "Fashion model / Model",
  "Fitness model",
  "Beauty, cosmetic & personal care",
  "Health/beauty",
  "Travel blogger",
  "Food blogger",
] as const;

type Rule = { label: string; keywords: string[] };

// The live Instagram API only returns a generic "Instagram Professional" label,
// so the category is inferred from the public name and biography. More specific
// rules are checked first so brands are never mistaken for creators.
const RULES: Rule[] = [
  // Agencies describe themselves with words other rules would claim ("social
  // media agency" -> media, "built for brands" -> brand, "content" -> creator),
  // so the agency rule is checked first. Instagram's own business category
  // "Marketing Agency" also matches here.
  {
    label: "Marketing agency",
    keywords: [
      "marketing agency",
      "digital agency",
      "digital marketing",
      "advertising agency",
      "ad agency",
      "social media agency",
      "social media marketing",
      "creative agency",
      "media agency",
      "branding agency",
      "pr agency",
      "influencer marketing",
      "influencer agency",
      "influencer & celebrity management",
      "engagement agency",
      "agency",
    ],
  },
  // An explicit self-description is the strongest signal, so check it before the
  // business rules: a creator bio can still mention "brand collaborations".
  {
    label: "Content creator",
    keywords: ["content creator"],
  },
  {
    label: "Beauty, cosmetic & personal care",
    keywords: [
      "beauty",
      "makeup",
      "cosmetic",
      "kyliecosmetics",
      "skincare",
      "skin care",
      "skin-first",
      "product reviews",
    ],
  },
  {
    label: "Health/beauty",
    keywords: ["health & fitness", "health/beauty", "wellness", "self-care", "self care"],
  },
  {
    label: "Fitness model",
    keywords: ["fitness model", "gym", "workout", "training"],
  },
  {
    label: "Fashion model / Model",
    keywords: ["fashion", "model", "style", "outfit", "runway"],
  },
  {
    label: "Travel & tourism",
    keywords: [
      "airline",
      "fly better",
      "flight",
      "visit qatar",
      "hotel",
      "hospitality",
      "tourism",
      "guide to",
      "flydubai",
      "airways",
      "burj khalifa",
      "tallest building",
      "landmark",
    ],
  },
  {
    label: "News & media",
    keywords: ["news", "media", "headlines", "magazine", "time out", "geographic", "original stories"],
  },
  {
    label: "Food blogger",
    keywords: [
      "food creator",
      "food blogger",
      "food",
      "chef",
      "recipe",
      "cooking",
      "restaurant",
      "cafe",
      "food & drink",
    ],
  },
  {
    label: "Travel blogger",
    keywords: ["travel", "wander", "hidden gems", "destinations", "slow cities", "long trains"],
  },
  {
    label: "Reel/Video creator",
    keywords: ["reel creator", "reels creator", "video creator", "tiktok", "youtube"],
  },
  // "Personal blog" must precede "Blogger", whose "blog" keyword is broader.
  {
    label: "Personal blog",
    keywords: ["personal blog", "my life"],
  },
  {
    label: "Blogger",
    keywords: ["blogger", "blog", "lifestyle", "daily life", "diary"],
  },
  {
    label: "Digital creator",
    keywords: ["digital creator", "creator"],
  },
  // Business words come after every creator rule: creators often mention
  // brands ("Brand Collaborations") without being a brand themselves.
  {
    label: "Business & brand",
    keywords: ["we mean business", "brand", "mall", "dubaimall", "retail", "shop", "company"],
  },
  {
    label: "Public figure",
    keywords: [
      "actor",
      "singer",
      "footballer",
      "football player",
      "athlete",
      "celebrity",
      "no biography provided",
      "sh0w business",
      "albums",
      "movie",
      "film",
    ],
  },
  {
    label: "Sport",
    keywords: ["football", "soccer", "cricket", "nba", "f1", "sport"],
  },
  {
    label: "Music",
    keywords: ["music", "songs", "band", "dj"],
  },
];

// Every creator category in the product's list is mutually comparable (all are
// "creator" accounts). Brands and media stay inside their own type so an airline,
// news outlet or mall is never benchmarked against a content creator.
const GROUPS: Record<string, string> = {
  "Digital creator": "creator",
  "Blogger": "creator",
  "Personal blog": "creator",
  "Public figure": "creator",
  "Reel/Video creator": "creator",
  "Content creator": "creator",
  "Fashion model / Model": "creator",
  "Fitness model": "creator",
  "Beauty, cosmetic & personal care": "creator",
  "Health/beauty": "creator",
  "Travel blogger": "creator",
  "Food blogger": "creator",
  "News & media": "media",
  "Travel & tourism": "travel-business",
  "Business & brand": "business",
  "Marketing agency": "agency",
  "Sport": "sport",
  "Music": "music",
};

// Match a keyword at the start of a word. This avoids the "mall" in "small.uae"
// false positive while still letting stems match plurals ("cosmetic" -> "cosmetics").
function matchesKeyword(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\W)${escaped}`, "i").test(text);
}

function looksLikePerson(displayName: string): boolean {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) {
    return false;
  }
  return words.every((word) => /^[\p{Lu}][\p{Ll}'.-]*$/u.test(word));
}

// "Brand collaborations", "brand deals" and similar phrases describe a
// creator's work with brands, so they never make an account a brand.
const BRAND_WORK_PHRASES = /\bbrand\s*(collab\w*|deals?|partnerships?|work|inquiries|enquiries)\b/gi;

function explicitCategory(rawText: string): string | null {
  const text = rawText.replace(BRAND_WORK_PHRASES, " ");
  for (const rule of RULES) {
    if (rule.keywords.some((keyword) => matchesKeyword(text, keyword))) {
      return rule.label;
    }
  }
  return null;
}

// A public profile label is only explicit when the name/bio actually matched a
// category rule. The "Digital creator" / "Public figure" fallbacks are useful for
// global benchmarks but must not satisfy the regional category-label gate.
export function inferExplicitCategory(profile: CreatorProfile): string | null {
  // Instagram's own category ("Reel creator", "Marketing Agency") wins when a
  // data source returned one, so the label matches the Instagram profile. The
  // adapters' generic placeholders never count; then the name and bio decide.
  const instagramCategory = isInstagramCategory(profile.category)
    ? explicitCategory(profile.category)
    : null;
  return instagramCategory ?? explicitCategory(`${profile.displayName} ${profile.bio}`);
}

export function isInstagramCategory(category: string | undefined): boolean {
  return Boolean(category) && !GENERIC_CATEGORY_LABELS.has(category!.trim().toLowerCase());
}

const GENERIC_CATEGORY_LABELS = new Set([
  "",
  "instagram professional",
  "instagram creator",
  "instagram account",
]);

export function inferCategory(profile: CreatorProfile): string {
  const matched = inferExplicitCategory(profile);
  if (matched) {
    return matched;
  }

  if (looksLikePerson(profile.displayName)) {
    return "Public figure";
  }

  return "Digital creator";
}

export function categoryGroup(category: string): string {
  return GROUPS[category] ?? "business";
}

export function isSimilarCategory(left: string, right: string): boolean {
  return left === right || categoryGroup(left) === categoryGroup(right);
}

// The Middle East profile benchmark deliberately ignores display names and
// bios. These rules read only Reel/post captions and hashtags, so an account's
// claimed category cannot make it look similar; its actual public posts must.
const POST_ACTIVITY_RULES: Rule[] = [
  {
    label: "News & media",
    keywords: ["news", "media", "headlines", "magazine", "breaking", "press"],
  },
  {
    label: "Travel & tourism",
    keywords: ["airline", "airways", "fly better", "flight", "hotel", "tourism", "landmark"],
  },
  {
    label: "Business & brand",
    keywords: ["brand", "mall", "retail", "shop", "store", "company", "product"],
  },
  { label: "Sport", keywords: ["football", "soccer", "cricket", "nba", "f1", "sport"] },
  {
    label: "Public figure",
    keywords: [
      "actor",
      "acting",
      "movie",
      "film",
      "cinema",
      "award",
      "grammy",
      "red carpet",
      "celebrity",
      "interview",
      "poetry",
      "poem",
      "festival",
      "concert",
      "شعر",
      "فيلم",
      "مهرجان",
      "حفل",
      "جائزة",
      "غرامي",
    ],
  },
  {
    label: "Beauty, cosmetic & personal care",
    keywords: ["beauty", "makeup", "cosmetic", "skincare", "clarins", "product review"],
  },
  {
    label: "Music",
    keywords: ["music", "song", "singer", "band", "dj", "غناء", "موسيقى"],
  },
  { label: "Fashion model / Model", keywords: ["fashion", "style", "outfit", "runway"] },
  {
    label: "Travel blogger",
    keywords: ["travel", "trip", "wander", "destination", "سفر", "رحلة"],
  },
  { label: "Food blogger", keywords: ["food", "chef", "recipe", "cooking", "restaurant", "cafe"] },
  { label: "Fitness model", keywords: ["fitness", "gym", "workout", "training"] },
  { label: "Digital creator", keywords: ["creator", "vlog", "reel", "video"] },
];

function matchesPostKeyword(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\W)${escaped}`, "iu").test(text);
}

export function postActivityText(profile: CreatorProfile): string {
  return profile.recentPosts
    .flatMap((post) => [post.caption ?? "", ...(post.hashtags ?? [])])
    .join(" ");
}

// Returns every activity inferred from public Reels/posts. Falling back to
// "Digital creator" keeps creator accounts comparable when they do not use any
// of the tracked keywords, while business/news/travel accounts stay isolated.
export function inferPostActivity(profile: CreatorProfile): string[] {
  const text = postActivityText(profile);
  const labels = POST_ACTIVITY_RULES.filter((rule) =>
    rule.keywords.some((keyword) => matchesPostKeyword(text, keyword)),
  ).map((rule) => rule.label);
  return labels.length > 0 ? [...new Set(labels)] : ["Digital creator"];
}
