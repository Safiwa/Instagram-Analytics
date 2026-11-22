import Link from "next/link";
import { ArrowUpRight, Flame, Gauge, MapPin } from "lucide-react";
import {
  getLeaderboard,
  TRENDING_WINDOW_DAYS,
  type LeaderboardEntry,
} from "../../core/data/leaderboard";
import { REGION_BOARDS } from "../../core/data/regions";
import { formatCompact, formatPercent } from "../../core/format";

function followerChange(entry: LeaderboardEntry): string {
  const sign = entry.followerChangePct > 0 ? "+" : "";
  return `${sign}${entry.followerChangePct}% follower change${entry.followerChangeEstimated ? " est." : ""}`;
}

function signalMeta(entry: LeaderboardEntry, window = false): string {
  const parts = [
    `${formatPercent(entry.engagementRate)} ER`,
    `${formatCompact(entry.avgInteractions)} avg interactions`,
    followerChange(entry),
  ];
  if (window) {
    parts.push(`${entry.postsInWindow} ${entry.postsInWindow === 1 ? "post" : "posts"} in window`);
  }
  return parts.join(" · ");
}

function EntryRow({
  entry,
  rank,
  value,
  label,
  meta,
}: {
  entry: LeaderboardEntry;
  rank: number;
  value: string;
  label: string;
  meta: string;
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
          @{entry.username} · {formatCompact(entry.followers)} followers
        </p>
        <p className="truncate text-[11px] text-slate-400">{meta}</p>
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
  metaFor,
  testId,
}: {
  title: string;
  subtitle: string;
  icon: typeof Flame;
  entries: LeaderboardEntry[];
  emptyMessage: string;
  valueFor: (entry: LeaderboardEntry) => string;
  label: string;
  metaFor: (entry: LeaderboardEntry) => string;
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
              meta={metaFor(entry)}
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

const RANK_SUBTITLE =
  "Ranked by followers (55%), engagement rate (20%), average interactions (15%) and 30-day follower change (10%)";
const REGION_RANK_SUBTITLE =
  "Ranked by follower count first, with the same four-factor score breaking ties";

export async function GlobalPulse() {
  const board = await getLeaderboard();

  return (
    <section data-testid="global-pulse" className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
          Global pulse
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
          Top public profiles, ranked by real data
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-500">
          Four-factor leaderboards from the {board.tracked} public Creator and Business accounts we
          track. Country boards are ordered strictly by follower count; worldwide boards still use
          the four-factor score with followers carrying the most weight. Rankings refresh every 15
          minutes and every number links back to a full analysis.
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
          Worldwide
        </h3>
        <div className="grid gap-4 lg:grid-cols-2">
          <RankCard
            title={`Trending · last ${TRENDING_WINDOW_DAYS} days`}
            subtitle={`Accounts with a recent post. ${RANK_SUBTITLE}.`}
            icon={Flame}
            entries={board.trending}
            emptyMessage="No tracked account has enough posts in this window yet. Check back shortly."
            valueFor={(entry) => entry.rankScore.toFixed(0)}
            label="Rank score"
            metaFor={(entry) => signalMeta(entry, true)}
            testId="trending-list"
          />
          <RankCard
            title="High engagement"
            subtitle={`Public engagement across up to 12 recent posts. ${RANK_SUBTITLE}.`}
            icon={Gauge}
            entries={board.engaged}
            emptyMessage="Engagement data is not available right now. Check back shortly."
            valueFor={(entry) => entry.rankScore.toFixed(0)}
            label="Rank score"
            metaFor={(entry) => signalMeta(entry)}
            testId="engagement-list"
          />
        </div>
      </div>

      <div data-testid="region-boards" className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
          By country
        </h3>
        <div className="grid gap-4 lg:grid-cols-2">
          {REGION_BOARDS.map((definition) => {
            const entries = board.regional[definition.id];
            return (
              <RankCard
                key={definition.id}
                title={definition.label}
                subtitle={`${definition.description}. ${REGION_RANK_SUBTITLE}.`}
                icon={MapPin}
                entries={entries}
                emptyMessage={`No tracked account in ${definition.label.replace(" · top 10", "")} yet. Check back shortly.`}
                valueFor={(entry) => entry.rankScore.toFixed(0)}
                label="Rank score"
                metaFor={(entry) => signalMeta(entry)}
                testId={`region-${definition.id}-list`}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
