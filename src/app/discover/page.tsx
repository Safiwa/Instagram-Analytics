import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import { InstagramLink } from "../../components/InstagramLink";
import { isDatabaseConfigured } from "../../core/db/client";
import { countIndexedProfiles, listIndexCountries, searchIndex } from "../../core/db/indexStore";
import { formatCompact, formatDate, formatPercent } from "../../core/format";
import {
  parseDiscoverParams,
  SIZE_OPTIONS,
  SORT_OPTIONS,
  toFilters,
} from "../../features/discover/filters";
import { ensureRecordedLocations } from "../../core/db/accountLocations";

export const dynamic = "force-dynamic";

type DiscoverPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const FIELD_CLASS =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none";

export default async function DiscoverPage({ searchParams }: DiscoverPageProps) {
  await ensureRecordedLocations();
  if (!isDatabaseConfigured()) {
    return (
      <EmptyState
        title="Creator search is not enabled"
        description="The in-house index needs the history database. Look up any public handle from the home page instead."
        action={{ href: "/", label: "Look up a handle" }}
      />
    );
  }

  const params = parseDiscoverParams(await searchParams);
  const [results, countries, indexSize] = await Promise.all([
    searchIndex(toFilters(params)),
    listIndexCountries(),
    countIndexedProfiles(),
  ]);

  return (
    <div data-testid="discover-page" className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
          Our creator index
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Find creators</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Search the {indexSize === null ? "" : `${indexSize.toLocaleString("en-US")} `}profiles this
          site has measured in the last 30 days. Every value comes from this site&apos;s own stored
          snapshots. The index grows each time a profile is looked up and with every daily
          collector run.
        </p>
      </div>

      <form
        data-testid="discover-filters"
        method="get"
        className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]"
      >
        <label className="text-xs font-medium text-slate-600">
          Name, handle or category
          <input name="q" defaultValue={params.q} placeholder="e.g. beauty, dubai" className={`mt-1 ${FIELD_CLASS}`} />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Country
          <select name="country" defaultValue={params.country} className={`mt-1 ${FIELD_CLASS}`}>
            <option value="">Any country</option>
            {countries.map((entry) => (
              <option key={entry.country} value={entry.country}>
                {entry.country} ({entry.profiles})
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Audience size
          <select name="size" defaultValue={params.size} className={`mt-1 ${FIELD_CLASS}`}>
            {SIZE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Sort by
          <select name="sort" defaultValue={params.sort} className={`mt-1 ${FIELD_CLASS}`}>
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="self-end rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Search
        </button>
      </form>

      {results.length === 0 ? (
        <EmptyState
          title="No indexed profiles match"
          description="Try a wider size or another country. Profiles join the index when someone looks them up or the daily collector measures them."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table data-testid="discover-results" className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Profile</th>
                <th className="px-4 py-3 font-medium">Country</th>
                <th className="px-4 py-3 text-right font-medium">Followers</th>
                <th className="px-4 py-3 text-right font-medium">Engagement</th>
                <th className="px-4 py-3 text-right font-medium">Avg likes</th>
                <th className="px-4 py-3 text-right font-medium">Measured</th>
              </tr>
            </thead>
            <tbody>
              {results.map((row) => (
                <tr key={row.username} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/profile/${encodeURIComponent(row.username)}`}
                        className="font-medium text-slate-950 hover:text-indigo-700"
                      >
                        {row.displayName}
                      </Link>
                      {row.isVerified ? (
                        <BadgeCheck className="h-4 w-4 text-emerald-600" aria-label="Verified" />
                      ) : null}
                      <InstagramLink username={row.username} />
                    </div>
                    <p className="text-xs text-slate-500">
                      @{row.username} · {row.category}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.country ?? "Not shared"}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-950">
                    {formatCompact(row.followers)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {formatPercent(row.engagementRate)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">{formatCompact(row.avgLikes)}</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-500">
                    {formatDate(`${row.capturedOn}T00:00:00Z`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
            Showing up to 50 profiles. A dash (—) means posts were hidden when the profile was
            measured, not zero.
          </p>
        </div>
      )}
    </div>
  );
}
