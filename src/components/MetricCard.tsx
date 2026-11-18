type MetricCardProps = {
  label: string;
  value: string;
  hint?: string;
  badge?: string;
};

export function MetricCard({ label, value, hint, badge }: MetricCardProps) {
  return (
    <div
      data-testid="metric-card"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-500">
        {label}
        {badge ? (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-amber-800">
            {badge}
          </span>
        ) : null}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
