// Instagram does not expose an account's country, so the homepage region boards use
// a curated map of the public accounts we track. This is editorial metadata about
// each handle, not a claim derived from Instagram audience demographics. Accounts
// based in the UAE are listed under "uae" only; the Middle East board covers the
// rest of the region (Qatar, Saudi Arabia, Jordan, Egypt and Kuwait).
export type Region = "usa" | "europe" | "middle-east" | "uae";

export const REGION_BOARDS: { id: Region; label: string; description: string }[] = [
  { id: "usa", label: "USA · top 10", description: "Tracked accounts based in the United States" },
  { id: "europe", label: "Europe · top 10", description: "Tracked accounts based in Europe" },
  {
    id: "middle-east",
    label: "Middle East · top 10",
    description: "Tracked accounts in Qatar, Saudi Arabia, Jordan, Egypt and Kuwait",
  },
  { id: "uae", label: "UAE · top 10", description: "Tracked accounts based in the UAE" },
];

const ACCOUNT_REGIONS: Record<string, Region> = {
  // United States
  selenagomez: "usa",
  kyliejenner: "usa",
  therock: "usa",
  arianagrande: "usa",
  kimkardashian: "usa",
  beyonce: "usa",
  lilbieber: "usa",
  kendalljenner: "usa",
  taylorswift: "usa",
  zendaya: "usa",
  badgalriri: "usa",
  billieeilish: "usa",
  mrbeast: "usa",
  charlidamelio: "usa",
  jlo: "usa",
  leonardodicaprio: "usa",
  natgeo: "usa",

  // Europe
  cristiano: "europe",
  chiaraferragni: "europe",
  davidguetta: "europe",
  sofiamcoelho: "europe",
  zoella: "europe",
  fcbarcelona: "europe",
  realmadrid: "europe",
  psg: "europe",
  premierleague: "europe",
  adidas: "europe",
  gucci: "europe",

  // Middle East (outside the UAE)
  qatarairways: "middle-east",
  visitqatar: "middle-east",
  aljazeera: "middle-east",
  alarabiya: "middle-east",
  asharqnews: "middle-east",
  arabnews: "middle-east",
  visitsaudi: "middle-east",
  flynas: "middle-east",
  qatar: "middle-east",
  visitjordan: "middle-east",

  // United Arab Emirates
  hudabeauty: "uae",
  "the.matis": "uae",
  "trending.vibz.uae": "uae",
  "ola.alqodmani": "uae",
  emirates: "uae",
  flydubai: "uae",
  timeoutdubai: "uae",
  gulfnews: "uae",
  khaleejtimes: "uae",
  arabianbusiness: "uae",
  jumeirah: "uae",
  burjkhalifa: "uae",
  dubaimall: "uae",
  rafflesdubai: "uae",
};

export function regionForHandle(username: string): Region | null {
  return ACCOUNT_REGIONS[username.toLowerCase()] ?? null;
}
