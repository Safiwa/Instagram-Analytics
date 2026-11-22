import Link from "next/link";
import { EmptyState } from "../../components/EmptyState";
import { buildCompareRanking } from "../../core/analytics/compare";
import { computeMetrics } from "../../core/analytics/metrics";
import { findSimilarPeers } from "../../core/analytics/peer";
import { formatCompact, formatPercent } from "../../core/format";
import { parseHandles, resolveProfile } from "../../core/data/adapter";
import { getTrackedProfiles } from "../../core/data/leaderboard";
import { ComparisonTable, type ComparisonRow } from "../../features/comparison/ComparisonTable";

export const maxDuration = 60;

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

  const tracked = rows.length > 0 ? await getTrackedProfiles() : [];
  const existing = new Set(rows.map((row) => row.profile.username.toLowerCase()));
  const compareRanking =
    rows.length > 0
      ? buildCompareRanking(rows[0].profile, tracked, [
          ...rows.map((row) => row.profile.username),
          ...missing,
        ])
      : [];
  const rankedHandles = new Set(
    compareRanking.map((row) => row.profile.username.toLowerCase()),
  );
  const suggestions =
    rows.length > 0 && rows.length < 4
      ? findSimilarPeers(rows[0].profile, rows[0].metrics, tracked, 8)
          .filter(
            (match) =>
              !existing.has(match.profile.username.toLowerCase()) &&
              !rankedHandles.has(match.profile.username.toLowerCase()),
          )
          .slice(0, 4)
      : [];

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

      {rows.length > 0 ? (
        <section
          data-testid="compare-rank"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
            Ranked benchmarks
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
            Same country or region for @{rows[0].profile.username}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Other real public profiles in the same country or wider region, ordered by the same four
            factors: 55% followers, 20% engagement rate, 15% average interactions and 10% follower
            change. Country is inferred from the handle, profile text and promoted locations;
            Instagram does not publish account country.
          </p>
          {compareRanking.length > 0 ? (
            <ol className="mt-5 space-y-2">
              {compareRanking.map((row, index) => (
                <li
                  key={row.profile.username}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3"
                >
                  <span className="w-6 shrink-0 text-sm font-semibold text-slate-400">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/profile/${row.profile.username}`}
                      className="text-sm font-semibold text-slate-950 hover:text-indigo-600"
                    >
                      {row.profile.displayName}
                    </Link>
                    <p className="truncate text-xs text-slate-500">
                      @{row.profile.username} · {row.country.label} ·{" "}
                      {row.countryRelationship === "same-country" ? "Same country" : "Same region"} ·{" "}
                      {row.category}
                    </p>
                    <p className="truncate text-[11px] text-slate-400">
                      {formatCompact(row.profile.followers)} followers ·{" "}
                      {formatCompact(row.avgInteractions)} avg interactions ·{" "}
                      {formatPercent(row.followerChangePct)}
                      {row.followerChangeEstimated ? " est." : ""} follower change
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-slate-950">
                      {row.rankScore.toFixed(1)}
                    </p>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      Rank score
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      {formatPercent(row.engagementRate)} ER
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">
              No other tracked public profile in the same country or region is available right now.
            </p>
          )}
        </section>
      ) : null}

      {suggestions.length > 0 ? (
        <section
          data-testid="compare-suggestions"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
            Smarter comparables
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
            Suggested peers for @{rows[0].profile.username}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Picked from the same creator category, with the same country preferred. Country is
            inferred from the handle first, then profile text, hashtags and promoted locations;
            Instagram does not publish account country. Peers are ordered by the same four factors:
            followers, engagement rate, average interactions and follower change.
          </p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {suggestions.map((match) => {
              const handles = [...rows.map((row) => row.profile.username), match.profile.username]
                .slice(0, 4)
                .join(",");
              return (
                <li
                  key={match.profile.username}
                  className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/profile/${match.profile.username}`}
                      className="text-sm font-semibold text-slate-950 hover:text-indigo-600"
                    >
                      {match.profile.displayName}
                    </Link>
                    <p className="truncate text-xs text-slate-500">
                      @{match.profile.username} · {match.country.label} · {match.category}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{match.reasons.join(", ")}.</p>
                  </div>
                  <Link
                    href={`/compare?handles=${handles}`}
                    className="shrink-0 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
                  >
                    Add
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
