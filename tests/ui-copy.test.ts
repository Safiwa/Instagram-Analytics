import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("homepage positioning copy", () => {
  it("leads with the agency and collaboration services without naming the inspiration", () => {
    const page = source("src/app/page.tsx");

    expect(page).toContain(
      "Leading Marketing agency connecting brands with creators and managing events over the Middle East",
    );
    expect(page).toContain("Map brand and creator partnerships in one place");
    expect(page).toContain("Map paid partnerships");
    expect(page).toContain("Run affiliate programs");
    expect(page).toContain("Manage creator relationships");
    expect(page).toContain("Stage brand events");
    expect(page.toLowerCase()).not.toContain("modash");
  });
});

describe("growth reel-count badge", () => {
  it("labels the metric as reels and explains the public 12-post cap", () => {
    const dashboard = source("src/features/profile/ProfileDashboard.tsx");

    expect(dashboard).toContain("Reels in last 30 days");
    expect(dashboard).not.toContain("Posts in last 30 days");
    expect(dashboard).toContain("Latest 12 public posts checked; total may be higher");
  });
});

describe("no-post profile disclosure", () => {
  const dashboard = source("src/features/profile/ProfileDashboard.tsx");

  it("shows a dash, not zero, when Instagram did not expose recent posts", () => {
    expect(dashboard).toContain('{noPublicPosts ? "—" : growth.reelsLast30Days}');
    expect(dashboard).toContain('"Recent reels not exposed"');
    expect(dashboard).toContain("A dash (—) means the data was not");
    expect(dashboard).toContain("exposed, not zero.");
  });

  it("hides zero placeholders but keeps sourced engagement visible", () => {
    expect(dashboard).toContain('row.postsNotExposed && row.engagementSource === "unavailable"');
    expect(dashboard).toContain("engagementSignal(formatCompact(row.avgLikes), row)");
    expect(dashboard).toContain("engagementSignal(formatPercent(row.engagementRate), row)");
    expect(dashboard).toContain("changeSignal(formatPercent(row.followerChangePct), row)");
    expect(dashboard).toContain('"Posts not exposed"');
  });

  it("labels a stored-snapshot no-post profile with its measurement date, never a third party", () => {
    expect(dashboard).toContain("this site&apos;s own measurement from");
    expect(dashboard).toContain("` · engagement stored ${storedOn}`");
    expect(dashboard).toContain("this site's stored measurement from ${storedOn}, not today's public posts");
    expect(dashboard.toLowerCase()).not.toContain("modash");
  });

  it("shows the Middle East benchmark only for Middle East accounts", () => {
    expect(dashboard).toContain("const showRegionalBenchmark = isMiddleEastAccount(profile);");
    expect(dashboard).toMatch(/\{showRegionalBenchmark \? \(\s*<section\s+data-testid="regional-benchmark"/);
  });

  it("uses the exact similar-profile rank copy", () => {
    expect(dashboard).toContain(
      'Rank #{regionalRanking.targetRank} of {regionalRanking.total} of similar Middle East profiles',
    );
  });
});

describe("Instagram direct links in ranking rows", () => {
  const globalPulse = source("src/features/leaderboard/GlobalPulse.tsx");
  const dashboard = source("src/features/profile/ProfileDashboard.tsx");
  const instagramLink = source("src/components/InstagramLink.tsx");
  const format = source("src/core/format.ts");

  it("builds direct links from the account username", () => {
    expect(format).toContain(
      'return `https://www.instagram.com/${encodeURIComponent(username)}/`;',
    );
    expect(instagramLink).toContain("target=\"_blank\"");
    expect(instagramLink).toContain('rel="noopener noreferrer"');
  });

  it("adds an Instagram link beside the arrow on homepage leaderboard rows", () => {
    expect(globalPulse).toContain("<InstagramLink");
    expect(globalPulse).toContain("username={entry.username}");
  });

  it("adds Instagram links beside the arrows in both profile ranking tables", () => {
    expect(dashboard.match(/<InstagramLink/g)).toHaveLength(3);
    expect(dashboard).toContain("username={regionalPeer.profile.username}");
    expect(dashboard).toContain("username={row.profile.username}");
  });
});

describe("regional board country labels", () => {
  const globalPulse = source("src/features/leaderboard/GlobalPulse.tsx").replace(/\r\n/g, "\n");
  const leaderboard = source("src/core/data/leaderboard.ts").replace(/\r\n/g, "\n");

  it("shows the account-based country on both worldwide boards and country rows", () => {
    expect(leaderboard).toContain(
      'countryLabel: countrySignal.country ?? "Country not published"',
    );
    expect(globalPulse).toContain('testId="trending-list"\n            showCountry');
    expect(globalPulse).toContain('testId="engagement-list"\n            showCountry');
    expect(globalPulse).toContain(
      'showCountry={definition.id === "middle-east" || definition.id === "europe"}',
    );
    expect(globalPulse).toContain("{showCountry ? ` · ${entry.countryLabel}` : \"\"}");
  });

  it("discloses the published account-country first rule and public fallbacks", () => {
    expect(globalPulse).toContain("Instagram’s published “Account based in” value first");
    expect(globalPulse).toContain("public post/reel locations, hashtags and location flags");
    expect(globalPulse).toContain("Middle East and\n          UAE boards");
    expect(globalPulse).toContain("require public evidence");
    expect(globalPulse).toContain("unavailable values stay marked as not published");
  });
});

describe("Middle East board caption", () => {
  const globalPulse = source("src/features/leaderboard/GlobalPulse.tsx").replace(/\r\n/g, "\n");

  it("omits the subtitle element on the Middle East card", () => {
    expect(globalPulse).toContain("{subtitle ? (");
    expect(globalPulse).toContain('if (definition.id === "middle-east") return undefined;');
    expect(globalPulse).toContain("? entry.boardScore.toFixed(0)");
    expect(globalPulse.match(/entry\.rankScore\.toFixed\(0\)/g)).toHaveLength(3);
    expect(globalPulse).not.toContain("subtitle={`${definition.description}. ${REGION_RANK_SUBTITLE}.`}");
  });

  it("keeps the other region captions and discloses the 70/30 UAE order", () => {
    expect(globalPulse).toContain("Ranked with 70% followers, then the remaining weighted signals");
    expect(globalPulse).toContain(
      "USA and Europe country boards are ordered strictly by follower count; Middle East",
    );
    expect(globalPulse).toContain("and UAE boards give followers 70% of the score");
    expect(globalPulse).toContain("return `${definition.description}. ${REGION_RANK_SUBTITLE}.`;");
  });
});

describe("same-country peer benchmark", () => {
  const dashboard = source("src/features/profile/ProfileDashboard.tsx");
  const peer = source("src/core/analytics/peer.ts");

  it("enforces the same inferred country for the closest peer and ranking table", () => {
    expect(peer).toContain("requireSameCountry: true");
    expect(peer).toContain("candidateCountry.country === targetCountry.country");
    expect(dashboard).toContain("Compared with real accounts in the same category and country");
    expect(dashboard).toContain("only same-category accounts from neighbouring countries");
    expect(dashboard).toContain('data-testid="benchmarks"');
  });

  it("discloses the fallback when no country signal is published", () => {
    expect(dashboard).toContain("closest available country or region tier");
    expect(dashboard).toContain("no “Account based in” value is published");
  });
});

describe("follower history ranges", () => {
  it("explains when a range is longer than the measured history", () => {
    const panel = source("src/features/profile/TrackingHistory.tsx");
    expect(panel).toContain('data-testid="history-range-note"');
    expect(panel).toContain("measured so far");
    expect(panel).toContain("isAnimationActive={false}");
    expect(panel).toContain('data-testid="estimate-note"');
    expect(panel).toContain("It is not a\n          measured count.");
  });
});

describe("axis precision", () => {
  it("keeps close follower ticks distinct", async () => {
    const { formatAxisCompact } = await import("../src/core/format");
    expect(formatAxisCompact(1_040_000)).toBe("1.04M");
    expect(formatAxisCompact(1_020_000)).toBe("1.02M");
    expect(formatAxisCompact(932_000)).toBe("932K");
  });
});
