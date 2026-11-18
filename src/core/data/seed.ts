import type { Audience, CreatorProfile, MonthlyPoint, Post } from "./types";

const MONTHS = [
  "Dec 25", "Jan 26", "Feb 26", "Mar 26",
  "Apr 26", "May 26", "Jun 26", "Jul 26",
  "Aug 26", "Sep 26", "Oct 26", "Nov 26",
];

function history(start: number, end: number): MonthlyPoint[] {
  return MONTHS.map((month, index) => ({
    month,
    followers: Math.round(start + ((end - start) * index) / (MONTHS.length - 1)),
  }));
}

function post(
  id: string,
  type: Post["type"],
  caption: string,
  postedAt: string,
  likes: number,
  comments: number,
  saves: number,
  reach: number,
  hashtags: string[],
): Post {
  return { id, type, caption, postedAt, likes, comments, saves, reach, hashtags };
}

function audience(
  topCountries: [string, number][],
  ageGroups: [string, number][],
  gender: [string, number][],
): Audience {
  const toSlices = (rows: [string, number][]) =>
    rows.map(([label, percentage]) => ({ label, percentage }));
  return {
    topCountries: toSlices(topCountries),
    ageGroups: toSlices(ageGroups),
    gender: toSlices(gender),
  };
}

export const seedProfiles: CreatorProfile[] = [
  {
    username: "nora.style",
    displayName: "Nora Styles",
    category: "Beauty",
    bio: "Skin-first routines, honest product reviews, and slow morning rituals.",
    followers: 10000,
    following: 420,
    postsCount: 184,
    isVerified: true,
    source: "demo",
    fakeFollowers: 350,
    followerHistory: history(8000, 10000),
    recentPosts: [
      post("n1", "Reel", "Five-minute glow routine", "2026-11-12", 100, 10, 20, 3200, ["#skincare", "#routine"]),
      post("n2", "Carousel", "What I actually repurchased", "2026-11-05", 200, 20, 40, 5100, ["#reviews"]),
      post("n3", "Photo", "Winter shelf refresh", "2026-10-29", 150, 15, 30, 4200, ["#shelfie"]),
      post("n4", "Reel", "One product, three ways", "2026-10-22", 50, 5, 10, 1800, ["#howto"]),
    ],
    audience: audience(
      [["United States", 42], ["United Kingdom", 18], ["Canada", 12], ["Germany", 8]],
      [["18-24", 34], ["25-34", 46], ["35-44", 14], ["45+", 6]],
      [["Female", 78], ["Male", 20], ["Other", 2]],
    ),
  },
  {
    username: "lumen.travel",
    displayName: "Lumen Travel",
    category: "Travel",
    bio: "Slow cities, long trains, and small hotels worth the detour.",
    followers: 48200,
    following: 810,
    postsCount: 612,
    isVerified: true,
    source: "demo",
    fakeFollowers: 2100,
    followerHistory: history(41000, 48200),
    recentPosts: [
      post("l1", "Reel", "48 hours in Kyoto", "2026-11-14", 1820, 96, 640, 22400, ["#travel", "#japan"]),
      post("l2", "Carousel", "Packing light, finally", "2026-11-07", 2410, 132, 910, 28600, ["#packing"]),
      post("l3", "Photo", "A hotel with no lobby", "2026-10-30", 1560, 74, 520, 19800, ["#design"]),
      post("l4", "Reel", "Night train essentials", "2026-10-23", 2080, 118, 780, 25100, ["#slowtravel"]),
    ],
    audience: audience(
      [["United States", 31], ["France", 16], ["Japan", 13], ["Australia", 9]],
      [["18-24", 22], ["25-34", 51], ["35-44", 19], ["45+", 8]],
      [["Female", 56], ["Male", 41], ["Other", 3]],
    ),
  },
  {
    username: "gym.aria",
    displayName: "Aria Strong",
    category: "Health & Fitness",
    bio: "Strength training for real schedules. Form over future discounts.",
    followers: 76500,
    following: 340,
    postsCount: 903,
    isVerified: true,
    source: "demo",
    fakeFollowers: 3100,
    followerHistory: history(62000, 76500),
    recentPosts: [
      post("g1", "Reel", "Deadlift setup in 20 seconds", "2026-11-15", 3120, 214, 1240, 41800, ["#strength"]),
      post("g2", "Carousel", "Four-week beginner plan", "2026-11-08", 4870, 302, 2310, 56200, ["#training"]),
      post("g3", "Photo", "My home gym, year three", "2026-11-01", 2680, 158, 990, 33400, ["#homegym"]),
      post("g4", "Reel", "Mobility you can do daily", "2026-10-25", 3540, 226, 1480, 46900, ["#mobility"]),
    ],
    audience: audience(
      [["United States", 38], ["United Kingdom", 14], ["Brazil", 11], ["Canada", 10]],
      [["18-24", 27], ["25-34", 48], ["35-44", 18], ["45+", 7]],
      [["Female", 49], ["Male", 48], ["Other", 3]],
    ),
  },
  {
    username: "crumbs.daily",
    displayName: "Crumbs Daily",
    category: "Food & Drink",
    bio: "Weeknight baking, sourdough experiments, and very strong coffee.",
    followers: 12400,
    following: 560,
    postsCount: 421,
    isVerified: false,
    source: "demo",
    fakeFollowers: 480,
    followerHistory: history(11000, 12400),
    recentPosts: [
      post("c1", "Reel", "One-bowl banana bread", "2026-11-13", 940, 62, 410, 12600, ["#baking"]),
      post("c2", "Carousel", "Sourdough starter, day 7", "2026-11-06", 1280, 91, 620, 16800, ["#sourdough"]),
      post("c3", "Photo", "Coffee ratio cheat sheet", "2026-10-31", 760, 48, 330, 10100, ["#coffee"]),
      post("c4", "Reel", "What is in my pantry", "2026-10-24", 880, 57, 380, 11900, ["#pantry"]),
    ],
    audience: audience(
      [["United States", 44], ["Canada", 15], ["Italy", 10], ["United Kingdom", 9]],
      [["18-24", 29], ["25-34", 43], ["35-44", 20], ["45+", 8]],
      [["Female", 63], ["Male", 34], ["Other", 3]],
    ),
  },
  {
    username: "atlas.frames",
    displayName: "Atlas Frames",
    category: "Art & Photography",
    bio: "Film scans, brutalist corners, and light that only lasts a minute.",
    followers: 33900,
    following: 290,
    postsCount: 738,
    isVerified: true,
    source: "demo",
    fakeFollowers: 1200,
    followerHistory: history(29000, 33900),
    recentPosts: [
      post("a1", "Photo", "Concrete and rain", "2026-11-11", 2140, 118, 880, 27900, ["#film"]),
      post("a2", "Carousel", "Editing a street frame", "2026-11-04", 2680, 146, 1120, 32100, ["#editing"]),
      post("a3", "Reel", "Golden hour, 90 seconds", "2026-10-28", 1920, 94, 760, 24300, ["#light"]),
      post("a4", "Photo", "Museum stairs", "2026-10-21", 1760, 82, 690, 21800, ["#architecture"]),
    ],
    audience: audience(
      [["United States", 27], ["Germany", 17], ["France", 14], ["Japan", 11]],
      [["18-24", 31], ["25-34", 45], ["35-44", 17], ["45+", 7]],
      [["Female", 47], ["Male", 50], ["Other", 3]],
    ),
  },
  {
    username: "metro.threads",
    displayName: "Metro Threads",
    category: "Fashion",
    bio: "Repeatable outfits, thrift finds, and tailoring notes from a small studio.",
    followers: 91800,
    following: 610,
    postsCount: 1129,
    isVerified: true,
    source: "demo",
    fakeFollowers: 5200,
    followerHistory: history(78000, 91800),
    recentPosts: [
      post("m1", "Reel", "Five outfits, one blazer", "2026-11-16", 5240, 318, 2210, 71200, ["#ootd"]),
      post("m2", "Carousel", "Thrifted and tailored", "2026-11-09", 6890, 442, 3180, 88400, ["#thrift"]),
      post("m3", "Photo", "Winter capsule, six pieces", "2026-11-02", 4310, 264, 1870, 59300, ["#capsule"]),
      post("m4", "Reel", "How the hem was fixed", "2026-10-26", 3980, 231, 1640, 54100, ["#tailoring"]),
    ],
    audience: audience(
      [["United States", 35], ["United Kingdom", 19], ["France", 12], ["Italy", 9]],
      [["18-24", 36], ["25-34", 44], ["35-44", 14], ["45+", 6]],
      [["Female", 71], ["Male", 26], ["Other", 3]],
    ),
  },
  {
    username: "pixel.pilot",
    displayName: "Pixel Pilot",
    category: "Technology",
    bio: "Tiny tools, keyboard shortcuts, and honest notes on shipping software.",
    followers: 25600,
    following: 180,
    postsCount: 507,
    isVerified: false,
    source: "demo",
    fakeFollowers: 900,
    followerHistory: history(22000, 25600),
    recentPosts: [
      post("p1", "Reel", "A command palette in 40 seconds", "2026-11-10", 1980, 142, 910, 28400, ["#devtools"]),
      post("p2", "Carousel", "My 2026 desk setup", "2026-11-03", 2640, 188, 1240, 35200, ["#setup"]),
      post("p3", "Photo", "Terminal themes compared", "2026-10-27", 1520, 96, 720, 21600, ["#terminal"]),
      post("p4", "Reel", "One shortcut a day", "2026-10-20", 1740, 121, 810, 24800, ["#productivity"]),
    ],
    audience: audience(
      [["United States", 40], ["India", 16], ["Germany", 11], ["United Kingdom", 10]],
      [["18-24", 24], ["25-34", 52], ["35-44", 18], ["45+", 6]],
      [["Female", 24], ["Male", 73], ["Other", 3]],
    ),
  },
  {
    username: "wild.wander",
    displayName: "Wild Wander",
    category: "Adventure & Outdoors",
    bio: "Trail notes, tent reviews, and maps that actually match the terrain.",
    followers: 15800,
    following: 470,
    postsCount: 366,
    isVerified: false,
    source: "demo",
    fakeFollowers: 640,
    followerHistory: history(13000, 15800),
    recentPosts: [
      post("w1", "Reel", "A ridge before sunrise", "2026-11-12", 1260, 78, 540, 17300, ["#hiking"]),
      post("w2", "Carousel", "Tent tested in heavy rain", "2026-11-05", 1680, 104, 790, 21900, ["#camping"]),
      post("w3", "Photo", "Trail markers explained", "2026-10-29", 980, 61, 430, 13200, ["#maps"]),
      post("w4", "Reel", "What fits in a 30L pack", "2026-10-22", 1140, 72, 510, 15700, ["#packing"]),
    ],
    audience: audience(
      [["United States", 36], ["Canada", 21], ["Australia", 12], ["New Zealand", 7]],
      [["18-24", 20], ["25-34", 47], ["35-44", 23], ["45+", 10]],
      [["Female", 38], ["Male", 59], ["Other", 3]],
    ),
  },
];
