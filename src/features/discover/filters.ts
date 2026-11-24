import type { DiscoverFilters, DiscoverSort } from "../../core/db/indexStore";

export const SIZE_OPTIONS = [
  { value: "", label: "Any size", min: undefined, max: undefined },
  { value: "nano", label: "Nano (1K-10K)", min: 1_000, max: 10_000 },
  { value: "micro", label: "Micro (10K-100K)", min: 10_000, max: 100_000 },
  { value: "macro", label: "Macro (100K-1M)", min: 100_000, max: 1_000_000 },
  { value: "mega", label: "Mega (1M+)", min: 1_000_000, max: undefined },
] as const;

export const SORT_OPTIONS: { value: DiscoverSort; label: string }[] = [
  { value: "followers", label: "Most followers" },
  { value: "engagement", label: "Highest engagement" },
  { value: "recent", label: "Recently measured" },
];

export type DiscoverParams = {
  q: string;
  country: string;
  size: string;
  sort: DiscoverSort;
};

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

// Turns raw URL search params into validated filters. Unknown values fall back
// to "any", so a hand-edited URL can never reach the database unchecked.
export function parseDiscoverParams(
  raw: Record<string, string | string[] | undefined>,
): DiscoverParams {
  const sizeValue = first(raw.size);
  const sortValue = first(raw.sort);
  return {
    q: first(raw.q).slice(0, 60),
    country: first(raw.country).slice(0, 80),
    size: SIZE_OPTIONS.some((option) => option.value === sizeValue) ? sizeValue : "",
    sort: SORT_OPTIONS.some((option) => option.value === sortValue)
      ? (sortValue as DiscoverSort)
      : "followers",
  };
}

export function toFilters(params: DiscoverParams): DiscoverFilters {
  const size = SIZE_OPTIONS.find((option) => option.value === params.size) ?? SIZE_OPTIONS[0];
  return {
    query: params.q || undefined,
    country: params.country || undefined,
    minFollowers: size.min,
    maxFollowers: size.max,
    sort: params.sort,
    limit: 50,
  };
}
