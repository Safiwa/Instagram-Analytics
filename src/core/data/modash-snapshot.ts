import type { ThirdPartyEngagement } from "./types";

// Sourced from the public Modash engagement-rate calculator/profile snapshot for
// @zuhaboutique2024 on 2026-11-23. Only non-secret, publicly displayed values
// are stored. This is a third-party estimate, not an Instagram measurement, and
// no verification token or API credential is retained.
export const MODASH_CALCULATOR_URL = "https://www.modash.io/engagement-rate-calculator";

export const MODASH_ENGAGEMENT_BY_HANDLE: Readonly<Record<string, ThirdPartyEngagement>> = {
  zuhaboutique2024: {
    source: "Modash",
    sourceUrl: MODASH_CALCULATOR_URL,
    reportUpdatedAt: "2026-10-27T11:16:59.199Z",
    // Modash reported 43,932 followers, 1.2177911317490667% ER, 47 average
    // likes and 22 average comments. Followers stay sourced from Instagram;
    // only the engagement fields below are applied.
    engagementRatePct: 1.2177911317490667,
    averageLikes: 47,
    averageComments: 22,
  },
};

export function getModashEngagement(handle: string): ThirdPartyEngagement | null {
  const key = handle.trim().replace(/^@/, "").toLowerCase();
  return MODASH_ENGAGEMENT_BY_HANDLE[key] ?? null;
}
