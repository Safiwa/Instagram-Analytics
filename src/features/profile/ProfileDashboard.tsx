"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  BadgeCheck,
  Download,
  GitCompareArrows,
  Layers3,
  MapPin,
  Scale,
  TrendingUp,
  Users,
  Video,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MetricCard } from "../../components/MetricCard";
import { modashBenchmark, MODASH_SOURCE_LABEL } from "../../core/analytics/benchmark";
import { ESTIMATE_CONFIDENCE_LABEL, type EstimateSignal } from "../../core/analytics/estimates";
import type { GrowthAnalysis } from "../../core/analytics/growth";
import { round2, type ProfileMetrics } from "../../core/analytics/metrics";
import type { PeerMatch, PeerRanking } from "../../core/analytics/peer";
import type {
  KeyComparison,
  RegionalPeer,
  RegionalRanking,
} from "../../core/analytics/regional";
import type { AudienceSlice, CreatorProfile } from "../../core/data/types";
import { formatCompact, formatDate, formatPercent } from "../../core/format";

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  fontSize: 12,
};

const IMPACT_DOT_CLASS: Record<EstimateSignal["impact"], string> = {
  positive: "bg-emerald-500",
  neutral: "bg-slate-400",
  negative: "bg-amber-500",
};

type ProfileDashboardProps = {
  profile: CreatorProfile;
  metrics: ProfileMetrics;
  growth: GrowthAnalysis;
  peer: PeerMatch | null;
  ranking: PeerRanking | null;
  regionalPeer: RegionalPeer | null;
  regionalComparison: KeyComparison[];
  regionalRanking: RegionalRanking | null;
};

function Stat({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-sm font-semibold text-slate-950">{value}</p>
        {note ? <p className="text-[11px] text-slate-400">{note}</p> : null}
      </div>
    </div>
  );
}

function AudienceBars({ title, slices }: { title: string; slices: AudienceSlice[] }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      {slices.map((slice) => (
        <div key={slice.label}>
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>{slice.label}</span>
            <span className="font-medium text-slate-950">{slice.percentage}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-indigo-500"
              style={{ width: `${slice.percentage}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProfileDashboard({
  profile,
  metrics,
  growth,
  peer,
  ranking,
  regionalPeer,
  regionalComparison,
  regionalRanking,
}: ProfileDashboardProps) {
  const interactions = profile.recentPosts.map((post) => ({
    label: formatDate(post.postedAt, false),
    likes: post.likes,
    comments: post.comments,
    saves: post.saves,
  }));
  const hasSaves = metrics.avgSaves !== null;
  const hasViews = profile.recentPosts.some((post) => typeof post.viewCount === "number");
  const noPublicPosts =
    profile.source !== "demo" && !profile.isPrivate && profile.recentPosts.length === 0;
  const tier = modashBenchmark(profile.followers);
  const benchmarkHint = tier
    ? ` ${MODASH_SOURCE_LABEL}: ${tier.label} ${tier.followers} typically ${tier.range}.`
    : "";
  const momentumLabel =
    growth.momentum === "unknown" ? "Not enough data" : growth.momentum.charAt(0).toUpperCase() + growth.momentum.slice(1);
  const peerDelta = peer ? round2(metrics.engagementRate - peer.metrics.engagementRate) : null;
  const peerInsight =
    peerDelta === null
      ? ""
      : peerDelta > 0
        ? `${peerDelta.toFixed(2)} points above this peer`
        : peerDelta < 0
          ? `${Math.abs(peerDelta).toFixed(2)} points below this peer`
          : "level with this peer";

  const initials =
    profile.displayName
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || profile.username.slice(0, 2).toUpperCase();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
            Profile analysis
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            @{profile.username}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/compare?handles=${profile.username}`}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300"
          >
            <GitCompareArrows className="h-4 w-4" aria-hidden="true" />
            Compare
          </Link>
          <a
            href={`/api/report?handles=${profile.username}`}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download PDF
          </a>
        </div>
      </div>

      <section
        data-testid="profile-header"
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-xl font-bold text-white">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-slate-950">{profile.displayName}</h2>
              <span
                data-testid="verification-badge"
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  profile.isVerified
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {profile.isVerified ? (
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                ) : null}
                {profile.isVerified ? "Verified" : "Not verified"}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              @{profile.username} · {profile.category}
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">{profile.bio}</p>
            {profile.website ? (
              <a
                href={profile.website}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                {profile.website}
              </a>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-3">
          <Stat icon={Users} label="Followers" value={formatCompact(profile.followers)} />
          <Stat icon={Layers3} label="Posts tracked" value={formatCompact(profile.postsCount)} />
          <Stat
            icon={Video}
            label="Fake-follower estimate"
            value={formatCompact(metrics.fakeFollowers)}
            note={metrics.authenticityEstimated ? "Modeled from public signals" : undefined}
          />
        </div>
      </section>

      {noPublicPosts ? (
        <div
          data-testid="no-posts-notice"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          Instagram did not expose this account&apos;s posts to its public pages on this lookup, so
          engagement and modeled metrics cannot be calculated yet. The follower, following, and
          post counts above are public. Try again in a few minutes, or connect the official API for
          accounts you manage.
        </div>
      ) : null}

      {profile.source !== "demo" ? (
        <div
          data-testid={profile.source === "public" ? "public-notice" : "live-notice"}
          className={`rounded-xl border px-4 py-3 text-sm ${
            profile.source === "public"
              ? "border-sky-200 bg-sky-50 text-sky-900"
              : "border-indigo-200 bg-indigo-50 text-indigo-900"
          }`}
        >
          {profile.isPrivate
            ? "This account is private. Public follower and post counts are available, but posts and engagement are hidden, so modeled metrics are unavailable."
            : profile.source === "public"
              ? "Public web data from Instagram's public profile page. Saves, reach, audience demographics, and measured follower history are not exposed. Fake followers, authenticity, and 12-month growth are modeled estimates from public signals when posts are visible."
              : "Official API data via Instagram Business Discovery. Saves, reach, audience demographics, and measured follower history are not exposed. Fake followers, authenticity, and 12-month growth are modeled estimates from public signals when posts are visible."}
        </div>
      ) : null}

      <section data-testid="metric-grid" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Engagement rate"
          value={profile.isPrivate || noPublicPosts ? "—" : formatPercent(metrics.engagementRate)}
          hint={`${
            profile.isPrivate || noPublicPosts
              ? "No public posts available"
              : metrics.engagementBasis === "likes+comments"
                ? "Public likes + comments / followers"
                : "Avg interactions / followers"
          }${benchmarkHint}`}
        />
        <MetricCard
          label="12-month growth"
          value={formatPercent(metrics.followerGrowthPct)}
          badge={metrics.growthEstimated ? "Est." : undefined}
          hint={
            metrics.growthEstimated
              ? "Modeled from public signals"
              : metrics.followerGrowthPct === null
                ? "History not available"
                : "First to last monthly point"
          }
        />
        <MetricCard
          label="30-day growth"
          value={formatPercent(growth.monthGrowthPct)}
          badge={growth.growthEstimated ? "Est." : undefined}
          hint={
            growth.growthEstimated
              ? "Modeled from public signals"
              : growth.monthGrowthPct === null
                ? "History not available"
                : "Last two monthly points"
          }
        />
        <MetricCard
          label="Authenticity"
          value={formatPercent(metrics.authenticityPct)}
          badge={metrics.authenticityEstimated ? "Est." : undefined}
          hint={
            metrics.authenticityEstimated
              ? "100 - modeled fake follower share"
              : metrics.authenticityPct === null
                ? "Not available from public data"
                : "100 - fake follower share"
          }
        />
        <MetricCard
          label="Avg interactions"
          value={
            profile.isPrivate || noPublicPosts
              ? "—"
              : formatCompact(metrics.avgLikes + metrics.avgComments + (metrics.avgSaves ?? 0))
          }
          hint={
            profile.isPrivate || noPublicPosts
              ? "No public posts available"
              : metrics.engagementBasis === "likes+comments"
                ? "Likes + comments"
                : "Likes + comments + saves"
          }
        />
      </section>

      <section
        data-testid="growth-analysis"
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
              Growth plan
            </p>
            <h3 className="mt-1 text-base font-semibold text-slate-950">30-day growth analysis</h3>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">{growth.basis}</p>
          </div>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
            Momentum: {momentumLabel}
          </span>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Follower change · 30d
            </p>
            <p className="mt-2 text-xl font-semibold text-slate-950">
              {formatPercent(growth.monthGrowthPct)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {growth.monthGrowthFollowers === null
                ? "Not available"
                : `${growth.monthGrowthFollowers >= 0 ? "+" : ""}${growth.monthGrowthFollowers.toLocaleString("en-US")} followers ${growth.growthEstimated ? "(Est.)" : ""}`}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Interaction trend
            </p>
            <p className="mt-2 text-xl font-semibold text-slate-950">
              {formatPercent(growth.engagementTrendPct)}
            </p>
            <p className="mt-1 text-xs text-slate-500">Median recent vs older posts</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Posting cadence
            </p>
            <p className="mt-2 text-xl font-semibold text-slate-950">
              {growth.postsPerWeek === null ? "—" : `${growth.postsPerWeek}/wk`}
            </p>
            <p className="mt-1 text-xs text-slate-500">From recent public posts</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Posts in last 30 days
            </p>
            <p className="mt-2 text-xl font-semibold text-slate-950">{growth.postsLast30Days}</p>
            <p className="mt-1 text-xs text-slate-500">Visible public media only</p>
          </div>
        </div>
        {growth.growthEstimated ? (
          <p className="mt-4 text-xs text-amber-800">
            Est. — Instagram does not publish 30-day follower history, so the follower change is
            modeled from public signals.
          </p>
        ) : null}
      </section>

      {metrics.estimateConfidence ? (
        <section
          data-testid="estimate-panel"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-950">How these estimates work</h3>
              <p className="text-xs text-slate-500">
                Fake followers, authenticity, and 12-month growth
              </p>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-amber-800">
              {ESTIMATE_CONFIDENCE_LABEL[metrics.estimateConfidence]} confidence
            </span>
          </div>
          {metrics.estimateMethodology ? (
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              {metrics.estimateMethodology}
            </p>
          ) : null}
          {metrics.estimateSignals.length > 0 ? (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {metrics.estimateSignals.map((signal) => (
                <li
                  key={signal.label}
                  className="flex items-start gap-2 rounded-xl border border-amber-100 bg-white/70 px-3 py-2"
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${IMPACT_DOT_CLASS[signal.impact]}`}
                  />
                  <div>
                    <p className="text-xs font-semibold text-slate-900">{signal.label}</p>
                    <p className="text-xs text-slate-500">{signal.value}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        {profile.followerHistory.length >= 2 ? (
          <div data-testid="growth-chart" className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-slate-950">Follower growth</h3>
            <p className="text-xs text-slate-500">Last 12 monthly observations</p>
            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={profile.followerHistory} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis
                    tickFormatter={(value) => formatCompact(Number(value))}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => [formatCompact(Number(value)), "Followers"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="followers"
                    stroke="#4f46e5"
                    strokeWidth={2}
                    fill="url(#growthFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div
            data-testid="growth-unavailable"
            className="rounded-2xl border border-dashed border-slate-300 bg-white p-5"
          >
            <h3 className="text-sm font-semibold text-slate-950">Follower growth</h3>
            <p className="text-xs text-slate-500">
              {metrics.growthEstimated ? "Modeled 12-month estimate" : "Not available"}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              {metrics.growthEstimated
                ? `Instagram does not publish historical follower counts. The ${formatPercent(
                    metrics.followerGrowthPct,
                  )} figure above is modeled from current public signals, not measured history. See “How these estimates work” for the inputs.`
                : profile.isPrivate
                  ? "This account is private, so public posts and engagement are hidden and no growth estimate is produced."
                  : "Instagram publishes the current follower count, but not historical follower counts for public accounts."}
            </p>
          </div>
        )}

        <div
          data-testid="interactions-chart"
          className="rounded-2xl border border-slate-200 bg-white p-5"
        >
          <h3 className="text-sm font-semibold text-slate-950">Interactions per post</h3>
          <p className="text-xs text-slate-500">Latest published posts</p>
          {interactions.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">
              {noPublicPosts
                ? "Instagram did not expose posts for this handle on this lookup. Retry shortly to see per-post interactions."
                : "No public posts were returned, so there are no interactions to chart."}
            </p>
          ) : (
            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={interactions} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis
                    tickFormatter={(value) => formatCompact(Number(value))}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                  />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="likes" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="comments" fill="#a5b4fc" radius={[4, 4, 0, 0]} />
                  {metrics.avgSaves !== null ? (
                    <Bar dataKey="saves" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  ) : null}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      <section data-testid="recent-posts" className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-950">Recent posts</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="pb-3 pr-4 font-medium">Date</th>
                <th className="pb-3 pr-4 font-medium">Type</th>
                <th className="pb-3 pr-4 font-medium">Caption</th>
                <th className="pb-3 pr-4 text-right font-medium">Likes</th>
                <th className="pb-3 pr-4 text-right font-medium">Comments</th>
                {hasSaves ? <th className="pb-3 text-right font-medium">Saves</th> : null}
                {!hasSaves && hasViews ? <th className="pb-3 text-right font-medium">Views</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {profile.recentPosts.length === 0 ? (
                <tr>
                  <td colSpan={hasSaves || hasViews ? 6 : 5} className="py-6 text-center text-sm text-slate-500">
                    {noPublicPosts
                      ? "Instagram did not expose posts for this handle on this lookup. Retry shortly."
                      : "No public media was returned for this account."}
                  </td>
                </tr>
              ) : (
                profile.recentPosts.map((post) => (
                  <tr key={post.id} className="text-slate-600">
                    <td className="whitespace-nowrap py-3 pr-4">{formatDate(post.postedAt)}</td>
                    <td className="py-3 pr-4">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                        {post.type}
                      </span>
                    </td>
                    <td className="max-w-md py-3 pr-4 text-slate-950">{post.caption}</td>
                    <td className="py-3 pr-4 text-right">{formatCompact(post.likes)}</td>
                    <td className="py-3 pr-4 text-right">{formatCompact(post.comments)}</td>
                    {hasSaves ? (
                      <td className="py-3 text-right">{formatCompact(post.saves)}</td>
                    ) : hasViews ? (
                      <td className="py-3 text-right">{formatCompact(post.viewCount)}</td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {profile.audience ? (
        <section
          data-testid="audience"
          className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-6 md:grid-cols-3"
        >
          <AudienceBars title="Top countries" slices={profile.audience.topCountries} />
          <AudienceBars title="Age groups" slices={profile.audience.ageGroups} />
          <AudienceBars title="Gender" slices={profile.audience.gender} />
        </section>
      ) : (
        <section
          data-testid="audience-unavailable"
          className="rounded-2xl border border-dashed border-slate-300 bg-white p-6"
        >
          <h3 className="text-sm font-semibold text-slate-950">Audience demographics</h3>
          <p className="mt-1 text-sm text-slate-600">
            Not available for public accounts. Age, gender, and country breakdowns require insights
            access to the account itself.
          </p>
        </section>
      )}

      <section
        data-testid="peer-benchmark"
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <Scale className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
              Peer benchmark
            </p>
            <h3 className="mt-1 text-base font-semibold text-slate-950">
              Closest business peers and where this profile ranks
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              We match this profile to the closest real public accounts by audience size, business
              themes, and engagement, then rank the group by engagement rate so you can see how it
              performs against comparable profiles. This is a curated reference set, not an
              exhaustive niche search.
            </p>
          </div>
        </div>

        {peer ? (
          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/profile/${peer.profile.username}`}
                  className="group inline-flex items-center gap-1 text-sm font-semibold text-slate-950 transition hover:text-indigo-600"
                >
                  {peer.profile.displayName}
                  <ArrowUpRight
                    className="h-3 w-3 text-slate-400 group-hover:text-indigo-600"
                    aria-hidden="true"
                  />
                </Link>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  {peer.score.toFixed(0)}% match
                </span>
              </div>
              <p className="text-xs text-slate-500">@{peer.profile.username}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-slate-500">Followers</p>
                  <p className="text-sm font-semibold text-slate-950">
                    {formatCompact(peer.profile.followers)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Engagement</p>
                  <p className="text-sm font-semibold text-slate-950">
                    {formatPercent(peer.metrics.engagementRate)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Authenticity</p>
                  <p className="text-sm font-semibold text-slate-950">
                    {formatPercent(peer.metrics.authenticityPct)}
                    {peer.metrics.authenticityEstimated ? " est." : ""}
                  </p>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-slate-600">
                Why this peer: {peer.reasons.join(", ")}. This profile&apos;s engagement is{" "}
                <span className="font-semibold text-slate-950">{peerInsight}</span>.
              </p>
            </div>
            <Link
              href={`/compare?handles=${profile.username},${peer.profile.username}`}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              <TrendingUp className="h-4 w-4" aria-hidden="true" />
              Compare side by side
            </Link>
          </div>
        ) : null}

        {ranking ? (
          <div data-testid="peer-ranking" className="mt-5 overflow-hidden rounded-xl border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">
                  Rank #{ranking.targetRank} of {ranking.total} among comparable profiles
                </p>
                <p className="text-xs text-slate-500">
                  Ordered by engagement rate from up to 12 recent public posts
                </p>
              </div>
              {ranking.outperformedPercent !== null ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  Ahead of {ranking.outperformedPercent}% of these peers
                </span>
              ) : null}
            </div>
            <ol className="divide-y divide-slate-100">
              {ranking.rows.map((row, index) => (
                <li
                  key={row.profile.username}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    row.isTarget ? "bg-indigo-50/70" : ""
                  }`}
                >
                  <span
                    className={`w-6 shrink-0 text-sm font-semibold ${
                      row.isTarget ? "text-indigo-700" : "text-slate-400"
                    }`}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/profile/${row.profile.username}`}
                      className="group inline-flex max-w-full flex-wrap items-center gap-1 text-sm font-semibold text-slate-950 transition hover:text-indigo-600"
                    >
                      <span className="truncate">{row.profile.displayName}</span>
                      <ArrowUpRight
                        className="h-3 w-3 shrink-0 text-slate-400 group-hover:text-indigo-600"
                        aria-hidden="true"
                      />
                      {row.isTarget ? (
                        <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium normal-case text-indigo-700">
                          This profile
                        </span>
                      ) : null}
                    </Link>
                    <p className="truncate text-xs text-slate-500">
                      @{row.profile.username} · {formatCompact(row.profile.followers)} followers
                      {row.matchScore !== null ? ` · ${row.matchScore.toFixed(0)}% match` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-slate-950">
                      {formatPercent(row.engagementRate)}
                    </p>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      Engagement
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">
            No comparable tracked profile is available right now. Check back shortly.
          </p>
        )}
      </section>

      <section
        data-testid="regional-benchmark"
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <MapPin className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
              UAE &amp; GCC category benchmark
            </p>
            <h3 className="mt-1 text-base font-semibold text-slate-950">
              Closest regional business profile and where this account sits
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              We match this profile to the closest real public UAE/GCC account by business category,
              audience size, and engagement, compare four key metrics, then rank it among the top
              regional peers in our curated UAE/GCC tracking set. Match scores are relative to this
              regional pool, not an absolute identity claim.
            </p>
          </div>
        </div>

        {regionalPeer ? (
          <>
            <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/profile/${regionalPeer.profile.username}`}
                    className="group inline-flex items-center gap-1 text-sm font-semibold text-slate-950 transition hover:text-emerald-600"
                  >
                    {regionalPeer.profile.displayName}
                    <ArrowUpRight
                      className="h-3 w-3 text-slate-400 group-hover:text-emerald-600"
                      aria-hidden="true"
                    />
                  </Link>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    {regionalPeer.matchScore}% category match
                  </span>
                </div>
                <p className="text-xs text-slate-500">@{regionalPeer.profile.username}</p>
                {regionalPeer.sharedBusiness.length > 0 ? (
                  <p className="text-xs text-slate-500">
                    Shared business themes: {regionalPeer.sharedBusiness.join(", ")}
                  </p>
                ) : null}
              </div>
              <Link
                href={`/compare?handles=${profile.username},${regionalPeer.profile.username}`}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                <TrendingUp className="h-4 w-4" aria-hidden="true" />
                Compare side by side
              </Link>
            </div>

            <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
              <div className="grid grid-cols-[1.2fr_1fr_1fr_1.4fr] gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <span>Key comparison</span>
                <span>This profile</span>
                <span>{regionalPeer.profile.displayName}</span>
                <span>Insight</span>
              </div>
              {regionalComparison.map((comparison) => (
                <div
                  key={comparison.label}
                  className="grid grid-cols-[1.2fr_1fr_1fr_1.4fr] gap-2 border-b border-slate-100 px-4 py-3 text-xs last:border-0"
                >
                  <span className="font-medium text-slate-700">{comparison.label}</span>
                  <span className="font-semibold text-slate-950">{comparison.target}</span>
                  <span className="font-semibold text-slate-950">{comparison.peer}</span>
                  <span className="text-slate-500">{comparison.insight}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Verification reflects the account&apos;s public Instagram badge. Authenticity is an
              estimate for public accounts; see the estimates panel below for details.
            </p>
          </>
        ) : (
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">
            No comparable UAE/GCC profile is available right now. Check back shortly.
          </p>
        )}

        {regionalRanking ? (
          <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">
                  Rank #{regionalRanking.targetRank} of {regionalRanking.total} among top UAE/GCC
                  peers
                </p>
                <p className="text-xs text-slate-500">
                  Ordered by engagement rate from up to 12 recent public posts
                </p>
              </div>
              {regionalRanking.outperformedPercent !== null ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  Ahead of {regionalRanking.outperformedPercent}% of these peers
                </span>
              ) : null}
            </div>
            <ol className="divide-y divide-slate-100">
              {regionalRanking.rows.map((row, index) => (
                <li
                  key={row.profile.username}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    row.isTarget ? "bg-emerald-50/70" : ""
                  }`}
                >
                  <span
                    className={`w-6 shrink-0 text-sm font-semibold ${
                      row.isTarget ? "text-emerald-700" : "text-slate-400"
                    }`}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/profile/${row.profile.username}`}
                      className="group inline-flex max-w-full flex-wrap items-center gap-1 text-sm font-semibold text-slate-950 transition hover:text-emerald-600"
                    >
                      <span className="truncate">{row.profile.displayName}</span>
                      <ArrowUpRight
                        className="h-3 w-3 shrink-0 text-slate-400 group-hover:text-emerald-600"
                        aria-hidden="true"
                      />
                      {row.isTarget ? (
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium normal-case text-emerald-700">
                          This profile
                        </span>
                      ) : null}
                    </Link>
                    <p className="truncate text-xs text-slate-500">
                      @{row.profile.username} · {formatCompact(row.profile.followers)} followers
                      {row.matchScore !== null ? ` · ${row.matchScore}% category match` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-slate-950">
                      {formatPercent(row.engagementRate)}
                    </p>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      Engagement
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">
            No UAE/GCC ranking is available right now. Check back shortly.
          </p>
        )}
      </section>
    </div>
  );
}
