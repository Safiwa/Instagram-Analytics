import Link from "next/link";
import { ArrowUpRight, Flame, Gauge, Globe2 } from "lucide-react";
import {
  getLeaderboard,
  TRENDING_WINDOW_DAYS,
  type LeaderboardEntry,
} from "../../core/data/leaderboard";
import { formatCompact, formatDate, formatPercent } from "../../core/format";

function EntryRow({
  entry,
  rank,
  value,
  label,
  detail,
}: {
  entry: LeaderboardEntry;
  rank: number;
  value: string;
  label: string;
  detail: string;
}) {
  return (
    <li className="flex items-center gap-3 border-t border-slate-100 py-3 first:border-0 first:pt-0">
      <span className="w-6 shrink-0 text-sm font-semibold text-slate-400">
        {String(rank).padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1">
        <Link
          href={`/profile/${entry.username}`}
          className="group inline-flex max-w-full items-center gap-1 text-sm font-semibold text-slate-950 transition hover:text-indigo-600"
        >
          <span className="truncate">{entry.displayName}</span>
          <ArrowUpRight
            className="h-3 w-3 shrink-0 text-slate-400 group-hover:text-indigo-600"
            aria-hidden="true"
          />
        </Link>
        <p className="truncate text-xs text-slate-500">
          @{entry.username} · {formatCompact(entry.followers)} followers · {detail}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold text-slate-950">{value}</p>
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      </div>
    </li>
  );
}

function RankCard({
  title,
  subtitle,
  icon: Icon,
  entries,
  emptyMessage,
  valueFor,
  label,
  detailFor,
  testId,
}: {
  title: string;
  subtitle: string;
  icon: typeof Flame;
  entries: LeaderboardEntry[];
  emptyMessage: string;
  valueFor: (entry: LeaderboardEntry) => string;
  label: string;
  detailFor: (entry: LeaderboardEntry) => string;
  testId: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{subtitle}</p>
        </div>
      </div>
      {entries.length > 0 ? (
        <ol data-testid={testId} className="mt-4">
          {entries.map((entry, index) => (
            <EntryRow
              key={entry.username}
              entry={entry}
              rank={index + 1}
              value={valueFor(entry)}
              label={label}
              detail={detailFor(entry)}
            />
          ))}
        </ol>
      ) : (
        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">
          {emptyMessage}
        </p>
      )}
    </div>
  );
}

export async function GlobalPulse() {
  const board = await getLeaderboard();

  return (
    <section data-testid="global-pulse" className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
          Global pulse
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
          Top public profiles, ranked by real data
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-500">
          Two live leaderboards from the {board.tracked} public Creator and Business accounts we
          track worldwide. Rankings refresh every 15 minutes and every number links back to a full
          analysis.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RankCard
          title={`Trending · last ${TRENDING_WINDOW_DAYS} days`}
          subtitle="Highest engagement rate on posts published in the last 15 days"
          icon={Flame}
          entries={board.trending}
          emptyMessage="No tracked account has enough posts in this window yet. Check back shortly."
          valueFor={(entry) => formatPercent(entry.windowRate)}
          label="15-day ER"
          detailFor={(entry) =>
            `${entry.postsInWindow} ${entry.postsInWindow === 1 ? "post" : "posts"} in window`
          }
          testId="trending-list"
        />
        <RankCard
          title="High engagement"
          subtitle="Highest engagement rate across up to 12 recent public posts"
          icon={Gauge}
          entries={board.engaged}
          emptyMessage="Engagement data is not available right now. Check back shortly."
          valueFor={(entry) => formatPercent(entry.engagementRate)}
          label="Engagement"
          detailFor={(entry) => "Up to 12 recent posts"}
          testId="engagement-list"
        />
      </div>

      <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Globe2 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        Ranked among a curated tracked pool, not every account on Instagram. Engagement is
        measured from public likes and comments; saves are included only when exposed for every
        post in the window. Updated {formatDate(board.generatedAt)}.
      </p>
    </section>
  );
}
