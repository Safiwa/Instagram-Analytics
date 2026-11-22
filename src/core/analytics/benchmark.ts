export type BenchmarkTier = {
  label: string;
  followers: string;
  range: string;
  minimum: number;
  maximum: number | null;
};


// Published by Modash (updated 21 Oct 2026). Ranges describe typical Instagram
// engagement by audience size and are context, not a pass/fail grade.
export const MODASH_BENCHMARKS: BenchmarkTier[] = [
  { label: "Nano", followers: "1K-10K", range: "5-10%", minimum: 1_000, maximum: 10_000 },
  { label: "Micro", followers: "10K-100K", range: "3-7%", minimum: 10_000, maximum: 100_000 },
  { label: "Macro", followers: "100K-1M", range: "1-3%", minimum: 100_000, maximum: 1_000_000 },
  { label: "Mega", followers: "1M+", range: "0.5-2%", minimum: 1_000_000, maximum: null },
];

export function modashBenchmark(followers: number): BenchmarkTier | null {
  if (!Number.isFinite(followers) || followers < 1_000) {
    return null;
  }

  return (
    MODASH_BENCHMARKS.find(
      (tier) => followers >= tier.minimum && (tier.maximum === null || followers < tier.maximum),
    ) ?? null
  );
}
