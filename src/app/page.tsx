import Link from "next/link";
import { ArrowUpRight, GitCompareArrows, Search } from "lucide-react";
import { computeMetrics } from "../core/analytics/metrics";
import { searchProfiles } from "../core/data/adapter";
import { formatCompact, formatPercent } from "../core/format";
import { EmptyState } from "../components/EmptyState";
import { MetricCard } from "../components/MetricCard";
import { HandleLookup } from "../features/discovery/HandleLookup";

type HomeProps = {
  searchParams: Promise<{ q?: string | string[] }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const { q } = await searchParams;
  const query = Array.isArray(q) ? (q[0] ?? "") : (q ?? "");
  const profiles = searchProfiles(query);

  return (
    <div data-testid="directory" className="space-y-8">
      <section className="flex flex-col gap-6 rounded-2xl bg-slate-950 px-7 py-8 text-white md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">
            Profile intelligence
          </p>
          <h1 className="mt-2 max-w-xl text-3xl font-semibold tracking-tight">
            Analyze any public Instagram account.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
            Enter any public Instagram username. No API keys or Meta app needed. Compare up to four
            accounts and export a PDF report. The demo profiles below work offline.
          </p>
        </div>

        <HandleLookup />
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Demo profiles</h2>
            <p className="text-sm text-slate-500">
              {profiles.length} {profiles.length === 1 ? "result" : "results"}
              {query ? ` for "${query}"` : ""}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <form action="/" method="get" className="w-full sm:w-64">
              <label htmlFor="q" className="sr-only">
                Filter demo profiles
              </label>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 focus-within:border-indigo-300">
                <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <input
                  id="q"
                  name="q"
                  defaultValue={query}
                  placeholder="Filter by niche or name"
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
              </div>
            </form>
            <Link
              href="/compare"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
            >
              <GitCompareArrows className="h-4 w-4" aria-hidden="true" />
              Compare
            </Link>
          </div>
        </div>

        {profiles.length === 0 ? (
          <EmptyState
            title="No matching demo profiles"
            description={
              query
                ? `No demo fixture matches "${query}". If this is a real Instagram handle, use the lookup field at the top to read its public page.`
                : "Try a broader term such as travel, beauty, fashion, or technology. To analyze a new handle, use the field at the top."
            }
            action={{ href: "/", label: "Clear filter" }}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {profiles.map((profile) => {
              const metrics = computeMetrics(profile);

              return (
                <article
                  key={profile.username}
                  className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-indigo-600">
                        {profile.category}
                      </p>
                      <h3 className="mt-1 text-base font-semibold text-slate-950">
                        {profile.displayName}
                      </h3>
                      <p className="text-xs text-slate-500">@{profile.username}</p>
                    </div>
                    <Link
                      href={`/profile/${profile.username}`}
                      aria-label={`Open ${profile.displayName}`}
                      className="rounded-lg bg-slate-100 p-2 text-slate-500 transition group-hover:bg-indigo-50 group-hover:text-indigo-600"
                    >
                      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <MetricCard label="Followers" value={formatCompact(profile.followers)} />
                    <MetricCard label="Eng. rate" value={formatPercent(metrics.engagementRate)} />
                  </div>

                  <Link
                    href={`/compare?handles=${profile.username}`}
                    className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-indigo-600"
                  >
                    <GitCompareArrows className="h-3 w-3" aria-hidden="true" />
                    Add to comparison
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
