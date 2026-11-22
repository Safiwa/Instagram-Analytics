import { MODASH_BENCHMARKS } from "../../core/analytics/benchmark";

export function BenchmarkPanel() {
  return (
    <section data-testid="modash-benchmark">
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
    </section>
  );
}
