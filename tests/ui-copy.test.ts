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
      "UAE-Based marketing agency connecting brands with creators and managing events over the Middle East",
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

  it("hides zero placeholders from peer and regional comparison rows", () => {
    expect(dashboard).toContain('noPublicPosts && isTarget ? "—" : formatted');
    expect(dashboard).toContain("targetSignal(formatCompact(row.avgLikes), row.isTarget)");
    expect(dashboard).toContain("targetSignal(formatPercent(row.engagementRate), row.isTarget)");
    expect(dashboard).toContain('"Posts not exposed" : comparison.insight');
  });

  it("does not claim an engagement comparison for a profile with no posts", () => {
    expect(dashboard).toContain("not comparable because this account's posts were not exposed");
  });
});

describe("same-country peer benchmark", () => {
  const dashboard = source("src/features/profile/ProfileDashboard.tsx");
  const peer = source("src/core/analytics/peer.ts");

  it("enforces the same inferred country for the closest peer and ranking table", () => {
    expect(peer).toContain("requireSameCountry: true");
    expect(peer).toContain("candidateCountry.country === targetCountry.country");
    expect(dashboard).toContain(
      "Both the closest peer and ranking table are limited to accounts with the same inferred country",
    );
  });

  it("discloses the fallback when no country signal is published", () => {
    expect(dashboard).toContain("closest available country or region tier");
    expect(dashboard).toContain("Instagram does not publish account country");
  });
});
