import type { Audience, AudienceSlice } from "../data/types";
import type { DemographicSlice, Demographics } from "./api";

const GENDER_LABEL: Record<string, string> = { F: "Female", M: "Male", U: "Unspecified" };

let regionNames: Intl.DisplayNames | null = null;
function countryName(code: string): string {
  try {
    regionNames ??= new Intl.DisplayNames(["en"], { type: "region" });
    return regionNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

function round1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

// Shares of the follower base. Meta returns at most the top 45 values per
// breakdown, so shares are taken over what Instagram returned.
function toSlices(slices: DemographicSlice[] | undefined, label: (key: string) => string, limit: number): AudienceSlice[] {
  const total = (slices ?? []).reduce((sum, slice) => sum + slice.value, 0);
  if (!slices || total <= 0) {
    return [];
  }
  return slices
    .slice(0, limit)
    .map((slice) => ({ label: label(slice.key), percentage: round1((slice.value / total) * 100) }));
}

function ageOrder(label: string): number {
  const start = Number.parseInt(label, 10);
  return Number.isFinite(start) ? start : Number.MAX_SAFE_INTEGER;
}

// Converts stored follower demographics into the profile page's Audience
// shape. Returns undefined when Instagram returned no demographics (for
// example accounts under 100 followers).
export function toAudience(demographics: Demographics | null | undefined): Audience | undefined {
  if (!demographics) {
    return undefined;
  }
  const audience: Audience = {
    topCountries: toSlices(demographics.country, countryName, 5),
    ageGroups: toSlices(demographics.age, (key) => key, 10).sort((a, b) => ageOrder(a.label) - ageOrder(b.label)),
    gender: toSlices(demographics.gender, (key) => GENDER_LABEL[key] ?? key, 3),
  };
  return audience.topCountries.length + audience.ageGroups.length + audience.gender.length > 0
    ? audience
    : undefined;
}
