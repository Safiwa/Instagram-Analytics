import { EmptyState } from "../../components/EmptyState";
import { computeMetrics } from "../../core/analytics/metrics";
import { parseHandles, resolveProfile } from "../../core/data/adapter";
import { ComparisonTable, type ComparisonRow } from "../../features/comparison/ComparisonTable";

export const maxDuration = 30;

type ComparePageProps = {
  searchParams: Promise<{ handles?: string | string[] }>;
};

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const { handles } = await searchParams;
  const parsed = parseHandles(handles);
  const resolutions = await Promise.all(
    parsed.handles.map((handle) => resolveProfile(handle)),
  );
  const rows: ComparisonRow[] = [];
  const missing: string[] = [];

  resolutions.forEach((resolution, index) => {
    if (resolution.status === "found") {
      rows.push({ profile: resolution.profile, metrics: computeMetrics(resolution.profile) });
    } else {
      missing.push(parsed.handles[index]);
    }
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
          Side by side
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
          Compare profiles
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Up to four accounts, identical metrics, one report.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No profiles to compare"
          description={
            missing.length > 0
              ? `Could not load ${missing.join(", ")}. Open a profile and choose Compare, or add handles to the URL.`
              : "Open a profile and choose Compare, or add handles to the URL."
          }
          action={{ href: "/", label: "Browse profiles" }}
        />
      ) : (
        <ComparisonTable rows={rows} truncated={parsed.truncated} missing={missing} />
      )}
    </div>
  );
}
