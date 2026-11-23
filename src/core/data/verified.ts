// Real Instagram verification snapshot for the curated tracked pool.
//
// Meta's `business_discovery` response has no `is_verified` field, and the public
// lookup bridge is not reachable from Vercel's datacenter egress. These handles
// were read from their real public Instagram profile HTML on 2026-11-22 (each
// response carried the signed `X-Instagram-Proxy: ok` marker). `rim.official__` and
// the UAE creator band around @amrmaskoun were confirmed from real public profile
// pages/directories sourced from Instagram on 2026-11-23, along with the real
// 1.7–3.1M creator band around @alaaabuharb. This is a fallback only: a fresh
// `fetchPublicIdentity()` result always wins when the bridge is up.
//
// Not a claim of completeness and not a modeled value — only accounts whose
// public page was actually read are listed. Unknown handles stay "Not verified".
export const VERIFIED_HANDLES: ReadonlySet<string> = new Set([
  "adidas",
  "alarabiya",
  "aljazeera",
  "amrmaskoun",
  "arabianbusiness",
  "arabnews",
  "arianagrande",
  "asharqnews",
  "badgalriri",
  "baneenstars",
  "beyonce",
  "billieeilish",
  "burjkhalifa",
  "charlidamelio",
  "chiaraferragni",
  "cristiano",
  "davidguetta",
  "dubaimall",
  "emirates",
  "fcbarcelona",
  "flydubai",
  "flynas",
  "gucci",
  "gulfnews",
  "hudabeauty",
  "jlo",
  "jumeirah",
  "kendalljenner",
  "khaleejtimes",
  "kimkardashian",
  "kyliejenner",
  "leomessi",
  "leonardodicaprio",
  "lilbieber",
  "lookatsascha",
  "mrbeast",
  "natgeo",
  "neymarjr",
  "ola.alqodmani",
  "premierleague",
  "psg",
  "qatar",
  "qatarairways",
  "randdalati",
  "rafflesdubai",
  "realmadrid",
  "rim.official__",
  "rima_alosta",
  "sarahmalas",
  "selenagomez",
  "sofiamcoelho",
  "taimalfalasi",
  "taylorswift",
  "therock",
  "timeoutdubai",
  "trending.vibz.uae",
  "virat.kohli",
  "visitegypt",
  "visitjordan",
  "visitkuwait",
  "visitqatar",
  "visitsaudi",
  "wessamq",
  "zendaya",
  "zoella",
]);

/** True only for handles whose public Instagram page was read as verified. */
export function isVerifiedHandle(username: string | undefined): boolean {
  if (!username) {
    return false;
  }
  return VERIFIED_HANDLES.has(username.trim().replace(/^@/, "").toLowerCase());
}
