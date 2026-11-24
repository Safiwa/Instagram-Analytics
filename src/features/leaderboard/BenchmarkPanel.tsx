import {
  buildTierBenchmarks,
  MIN_TIER_SAMPLE,
  type TierBenchmark,
} from "../../core/analytics/benchmark";
import { isDatabaseConfigured } from "../../core/db/client";
import { countIndexedProfiles, getIndexSample } from "../../core/db/indexStore";
import { formatPercent } from "../../core/format";

// Home-page section: loads the index sample and renders the tier ranges.
// Renders nothing when the database is not configured or cannot be read.
export async function IndexBenchmark() {
  if (!isDatabaseConfigured()) {
    return null;
  }
  const [sample, indexSize] = await Promise.all([getIndexSample(), countIndexedProfiles()]);
  return <BenchmarkPanel benchmarks={buildTierBenchmarks(sample)} indexSize={indexSize} />;
}

type BenchmarkPanelProps = {
  benchmarks: TierBenchmark[];
  indexSize: number | null;
};

// Engagement ranges measured across this site's own index of stored profiles.
export function BenchmarkPanel({ benchmarks, indexSize }: BenchmarkPanelProps) {
  if (indexSize === null) {
    return null;
  }

  return (
    <section data-testid="index-benchmark" className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
          Our engagement index
        </p>
        <h2 className="mt-1 text-xl font-semibold text-slate-950">
          Typical engagement by audience size
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Measured from the latest stored snapshot of {indexSize.toLocaleString("en-US")} profiles
          tracked in the last 30 days. The range is the middle half of profiles in each tier
          (25th-75th percentile). A tier appears once it holds at least {MIN_TIER_SAMPLE} profiles.
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-slate-100 bg-slate-50 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          <span>Audience tier</span>
          <span>Engagement rate</span>
        </div>
        {benchmarks.map((benchmark) => (
          <div
            key={benchmark.tier.label}
            data-testid={`index-tier-${benchmark.tier.label.toLowerCase()}`}
            className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-slate-100 px-5 py-3 last:border-0"
          >
            <div>
              <p className="text-sm font-medium text-slate-950">{benchmark.tier.label} creators</p>
              <p className="text-xs text-slate-500">
                {benchmark.tier.followers} followers · {benchmark.sampleSize}{" "}
                {benchmark.sampleSize === 1 ? "profile" : "profiles"}
              </p>
            </div>
            {benchmark.ready ? (
              <p className="text-right text-sm font-semibold text-indigo-700">
                {formatPercent(benchmark.p25)}-{formatPercent(benchmark.p75)}
                <span className="block text-[11px] font-normal text-slate-500">
                  median {formatPercent(benchmark.median)}
                </span>
              </p>
            ) : (
              <p className="text-right text-xs text-slate-500">
                Building · {benchmark.sampleSize}/{MIN_TIER_SAMPLE}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
