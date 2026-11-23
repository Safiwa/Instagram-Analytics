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
      "Leading UAE marketing agency connecting brands with creators and managing events",
    );
    expect(page).toContain("Map brand and creator partnerships in one place");
    expect(page).toContain("Map paid partnerships");
    expect(page).toContain("Run affiliate programs");
    expect(page).toContain("Manage creator relationships");
    expect(page).toContain("Stage brand events");
    expect(page.toLowerCase()).not.toContain("modash");
  });
});

describe("growth post-count badge", () => {
  it("shows the visible count and explains the public cap instead of a plus-count", () => {
    const dashboard = source("src/features/profile/ProfileDashboard.tsx");

    expect(dashboard).not.toContain("${growth.postsLast30Days}+");
    expect(dashboard).toContain("Latest 12 public posts checked; total may be higher");
  });
});
