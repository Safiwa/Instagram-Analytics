import { ExternalLink, Scale } from "lucide-react";
import { MODASH_BENCHMARKS, MODASH_SOURCE_URL } from "../../core/analytics/benchmark";

export function BenchmarkPanel() {
  return (
    <section data-testid="modash-benchmark" className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
          External benchmark
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
          What does a good engagement rate look like?
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-500">
          Modash publishes typical Instagram engagement ranges by audience size. Use these
          benchmarks as context when you benchmark a creator, not as a pass/fail grade. Always
          compare profiles within the same niche and follower tier.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-slate-100 bg-slate-50 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          <span>Audience tier</span>
          <span>Typical engagement rate</span>
        </div>
        {MODASH_BENCHMARKS.map((tier) => (
          <div
            key={tier.label}
            className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-slate-100 px-5 py-3 last:border-0"
          >
            <div>
              <p className="text-sm font-medium text-slate-950">{tier.label} creators</p>
              <p className="text-xs text-slate-500">{tier.followers} followers</p>
            </div>
            <p className="text-sm font-semibold text-indigo-700">{tier.range}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
        <Scale className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        <p className="max-w-3xl">
          Modash uses median likes divided by followers over roughly the last three months. This
          site uses average likes and comments divided by followers over up to 12 recent posts, so
          treat the comparison as directional rather than exact.
          <a
            href={MODASH_SOURCE_URL}
            target="_blank"
            rel="noreferrer"
            className="ml-1 inline-flex items-center gap-1 font-medium text-indigo-600 hover:text-indigo-700"
          >
            Read the Modash methodology
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </p>
      </div>
    </section>
  );
}
