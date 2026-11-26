// Instagram does not expose an account's country, so the homepage region boards use
// a curated map of the public accounts we track. This is editorial metadata about
// each handle, not a claim derived from Instagram audience demographics. Accounts
// based in the UAE are also highlighted on their own "uae" board.
export type Region = "usa" | "europe" | "middle-east" | "uae";

// Countries covered by the Middle East board. Instagram has no account-country
// field, so these are editorial groupings of the real public accounts we track.
export const MIDDLE_EAST_COUNTRIES = [
  "Qatar",
  "Saudi Arabia",
  "Jordan",
  "Egypt",
  "Kuwait",
  "United Arab Emirates",
  "Syria",
  "Lebanon",
  "Iraq",
  "Palestine",
  "Bahrain",
  "Oman",
  "Tunisia",
  "Morocco",
  "Libya",
  "Iran",
] as const;

// Countries covered by the Europe board. This mirrors the public country rules
// used by the homepage country labels.
export const EUROPE_COUNTRIES = [
  "United Kingdom",
  "Italy",
  "France",
  "Spain",
  "Germany",
  "Portugal",
] as const;

export const REGION_BOARDS: { id: Region; label: string; description: string }[] = [
  {
    id: "usa",
    label: "USA creators · top 10",
    description: "Tracked creators based in the United States; brands and organisations are not included",
  },
  {
    id: "europe",
    label: "Europe creators · top 10",
    description: "Tracked creators based in Europe; brands and organisations are not included",
  },
  {
    id: "middle-east",
    label: "Middle East creators · top 10",
    description: `Tracked creators in ${MIDDLE_EAST_COUNTRIES.join(", ")}; brands and organisations are not included`,
  },
  {
    id: "uae",
    label: "UAE creators · top 10",
    description: "Tracked creators based in the UAE; brands and organisations are not included",
  },
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
  // European creators for the creators-only Europe board.
  khaby00: "europe",
  dulceida: "europe",
  pamela_rf: "europe",
  leoniehanne: "europe",
  carodaur: "europe",
  mariapombo: "europe",
  dualipa: "europe",
  tomholland2013: "europe",
  ksi: "europe",
  emmawatson: "europe",
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

  // Middle East (including UAE accounts, which also have a dedicated board)
  // Creators from Saudi Arabia, Iraq, Kuwait and Egypt for the creators-only
  // Middle East board (country checked on the live site).
  emadanwer: "middle-east",
  enaastaleb: "middle-east",
  ascia: "middle-east",
  kindaalloush: "middle-east",
  // Other Middle East countries, so the regional table is not mostly UAE.
  ahmedhelmy: "middle-east",
  yasmine_sabri: "middle-east",
  haifawehbe: "middle-east",
  dalalid: "middle-east",
  // Syria: creators and public figures, tracked so Syrian profiles have
  // same-country peers.
  jennyesber: "middle-east",
  nesreentafesh: "middle-east",
  dima_dalati: "middle-east",
  jamel_alhasan: "middle-east",
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
  explorepalestine: "middle-east",
  visitkuwait: "middle-east",
  visitoman: "middle-east",

  // United Arab Emirates
  // Dubai marketing agencies, tracked so agency profiles have real peers.
  dreamize_: "uae",
  mkvdigital: "uae",
  "tikit.ae": "uae",
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
  alisha_sajjal: "uae",
  alitofique: "uae",
  hinaashh: "uae",
  jexmi: "uae",
  donya_esmailiii: "uae",
  aiamwa: "uae",
  dina_h_ussien: "uae",
  poojaabis: "uae",
  taranum_sshahin: "uae",
  "dina.ak": "uae",
  anshi_pandyala_official: "uae",
  zeniamk: "uae",
  amrmaskoun: "uae",
  wessamq: "uae",
  taimalfalasi: "uae",
  baneenstars: "uae",
  sarahmalas: "uae",
  randdalati: "uae",
  lookatsascha: "uae",
  khalus_recipes: "uae",
  ladyandhersweetescapes: "uae",
  airagymn: "uae",

  // Other Middle East creators (Lebanon and creators without a published country)
  elsakahwaji: "middle-east",
  "najet.dh": "uae",
  "raw.lebanon": "middle-east",
};

export function regionForHandle(username: string): Region | null {
  return ACCOUNT_REGIONS[username.toLowerCase()] ?? null;
}

// The Middle East board covers every configured Middle East country, including
// the UAE. The UAE board remains a narrower editorial view of the same accounts.
// Every curated handle shown on a region board (the Middle East board includes UAE).
export function regionBoardHandles(board: Region): string[] {
  return Object.keys(ACCOUNT_REGIONS).filter((handle) => isInRegionBoard(handle, board));
}

// Organisations on the tracked lists: airlines, tourism boards, news outlets,
// venues, agencies, sports clubs, leagues and brands. Every country top-ten
// board is for creators, so these accounts are left off them.
const ORGANIZATIONS = new Set([
  "natgeo",
  "realmadrid",
  "fcbarcelona",
  "psg",
  "premierleague",
  "adidas",
  "gucci",
  "qatarairways",
  "visitqatar",
  "aljazeera",
  "alarabiya",
  "asharqnews",
  "arabnews",
  "visitsaudi",
  "flynas",
  "qatar",
  "visitjordan",
  "explorepalestine",
  "visitkuwait",
  "visitoman",
  "dreamize_",
  "mkvdigital",
  "tikit.ae",
  "hudabeauty",
  "emirates",
  "flydubai",
  "timeoutdubai",
  "gulfnews",
  "khaleejtimes",
  "arabianbusiness",
  "jumeirah",
  "burjkhalifa",
  "dubaimall",
  "rafflesdubai",
]);

export function isOrganization(username: string): boolean {
  return ORGANIZATIONS.has(username.toLowerCase());
}

export function isInRegionBoard(username: string, board: Region): boolean {
  const region = regionForHandle(username);
  if (region === board) {
    return true;
  }
  return board === "middle-east" && region === "uae";
}
