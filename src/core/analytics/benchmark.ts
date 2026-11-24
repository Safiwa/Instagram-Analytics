// Engagement benchmarks built from this site's own index: the latest measured
// engagement rate of every profile it has stored in the last 30 days. No
// third-party ranges are used. A tier is only reported once it has enough
// profiles to say something; until then it is shown as "building".

export type AudienceTier = {
  label: "Nano" | "Micro" | "Macro" | "Mega";
  followers: string;
  minimum: number;
  maximum: number | null;
};

export const AUDIENCE_TIERS: readonly AudienceTier[] = [
  { label: "Nano", followers: "1K-10K", minimum: 1_000, maximum: 10_000 },
  { label: "Micro", followers: "10K-100K", minimum: 10_000, maximum: 100_000 },
  { label: "Macro", followers: "100K-1M", minimum: 100_000, maximum: 1_000_000 },
  { label: "Mega", followers: "1M+", minimum: 1_000_000, maximum: null },
];

// Below this many profiles a tier's quartiles move too much with each new
// profile to be shown as a benchmark.
export const MIN_TIER_SAMPLE = 8;

export type SamplePoint = { followers: number; engagementRate: number };

export type TierBenchmark = {
  tier: AudienceTier;
  sampleSize: number;
  ready: boolean;
  p25: number | null;
  median: number | null;
  p75: number | null;
};

export type IndexPosition = {
  tier: AudienceTier;
  sampleSize: number;
  // Share of indexed profiles in the same tier with a lower engagement rate.
  percentile: number;
  median: number;
  p25: number;
  p75: number;
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function audienceTier(followers: number): AudienceTier | null {
  if (!Number.isFinite(followers) || followers < 1_000) {
    return null;
  }
  return (
    AUDIENCE_TIERS.find(
      (tier) => followers >= tier.minimum && (tier.maximum === null || followers < tier.maximum),
    ) ?? null
  );
}

// Linear-interpolated quantile of an ascending list (same method as most
// spreadsheet PERCENTILE functions).
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) {
    return Number.NaN;
  }
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function tierRates(sample: readonly SamplePoint[], tier: AudienceTier): number[] {
  return sample
    .filter((point) => Number.isFinite(point.engagementRate) && audienceTier(point.followers) === tier)
    .map((point) => point.engagementRate)
    .sort((a, b) => a - b);
}

export function buildTierBenchmarks(sample: readonly SamplePoint[]): TierBenchmark[] {
  return AUDIENCE_TIERS.map((tier) => {
    const rates = tierRates(sample, tier);
    const ready = rates.length >= MIN_TIER_SAMPLE;
    return {
      tier,
      sampleSize: rates.length,
      ready,
      p25: ready ? round2(quantile(rates, 0.25)) : null,
      median: ready ? round2(quantile(rates, 0.5)) : null,
      p75: ready ? round2(quantile(rates, 0.75)) : null,
    };
  });
}

// Where a profile's engagement rate sits among indexed profiles of its tier.
// The profile itself is excluded so it is never compared with its own value.
export function indexPosition(
  username: string,
  followers: number,
  engagementRate: number,
  sample: readonly (SamplePoint & { username?: string })[],
): IndexPosition | null {
  const tier = audienceTier(followers);
  if (!tier || !Number.isFinite(engagementRate)) {
    return null;
  }
  const key = username.toLowerCase();
  const rates = tierRates(
    sample.filter((point) => point.username?.toLowerCase() !== key),
    tier,
  );
  if (rates.length < MIN_TIER_SAMPLE) {
    return null;
  }
  const below = rates.filter((rate) => rate < engagementRate).length;
  const equal = rates.filter((rate) => rate === engagementRate).length;
  return {
    tier,
    sampleSize: rates.length,
    percentile: Math.round(((below + equal / 2) / rates.length) * 100),
    median: round2(quantile(rates, 0.5)),
    p25: round2(quantile(rates, 0.25)),
    p75: round2(quantile(rates, 0.75)),
  };
}
