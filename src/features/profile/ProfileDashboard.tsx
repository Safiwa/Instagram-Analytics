"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
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
import { InstagramLink } from "../../components/InstagramLink";
import { MetricCard } from "../../components/MetricCard";
import { inferExplicitCategory, isInstagramCategory } from "../../core/analytics/category";
import { inferCountrySignal, isMiddleEastAccount } from "../../core/analytics/country";
import { MIN_MODEL_FOLLOWERS } from "../../core/analytics/estimates";
import { ESTIMATE_CONFIDENCE_LABEL, type EstimateSignal } from "../../core/analytics/estimates";
import type { IndexPosition } from "../../core/analytics/benchmark";
import type { GrowthAnalysis } from "../../core/analytics/growth";
import { describeFakeFollowers, round2, type ProfileMetrics } from "../../core/analytics/metrics";
import { likesVisible } from "../../core/analytics/posts";
import { RANK_FILL_LABEL, type PeerMatch, type PeerRanking } from "../../core/analytics/peer";
import type {
  KeyComparison,
  RegionalPeer,
  RegionalRanking,
} from "../../core/analytics/regional";
import type { AudienceSlice, CreatorProfile } from "../../core/data/types";
import { formatCompact, formatDate, formatPercent } from "../../core/format";
import { IndexPositionCard, TrackingHistoryPanel } from "./TrackingHistory";

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
  indexPosition?: IndexPosition | null;
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
  indexPosition = null,
}: ProfileDashboardProps) {
  const interactions = profile.recentPosts.map((post) => ({
    label: formatDate(post.postedAt, false),
    likes: likesVisible(post) ? post.likes : 0,
    comments: post.comments,
    saves: post.saves,
  }));
  const hasSaves = metrics.avgSaves !== null;
  const hasViews = profile.recentPosts.some((post) => typeof post.viewCount === "number");
  const noPublicPosts =
    profile.source !== "demo" && !profile.isPrivate && profile.recentPosts.length === 0;
  const hasStoredEngagement = metrics.engagementSource === "stored-snapshot";
  const storedOn = metrics.storedEngagement
    ? formatDate(`${metrics.storedEngagement.measuredOn}T00:00:00Z`)
    : "";
  const engagementUnavailable = metrics.engagementSource === "unavailable";
  const benchmarkCountry = inferCountrySignal(profile).country;
  // The Middle East benchmark is shown only for Middle East accounts.
  const showRegionalBenchmark = isMiddleEastAccount(profile);
  const benchmarkScope = benchmarkCountry
    ? `The closest peer and the ranking table use accounts with the same inferred country (${benchmarkCountry}) first. The table aims for five profiles: when fewer same-country peers are tracked, remaining rows are filled only with same-category accounts from neighbouring countries in the same region, each marked; other countries and categories are never used.`
    : "Instagram has not published an “Account based in” value for this profile, so the closest available country or region tier is used instead.";
  // rankFactors falls back to zero when Instagram exposes no posts. That zero is
  // a placeholder, not a measurement. Engagement from a dated stored snapshot is
  // a real earlier measurement and stays visible; follower change and Reels remain hidden.
  type SignalRow = {
    isTarget: boolean;
    postsNotExposed: boolean;
    engagementSource: string;
  };
  const engagementSignal = (formatted: string, row: SignalRow) =>
    row.postsNotExposed && row.engagementSource === "unavailable" ? "—" : formatted;
  const changeSignal = (formatted: string, row: SignalRow) =>
    row.postsNotExposed ? "—" : formatted;
  const momentumLabel =
    growth.momentum === "unknown" ? "Not enough data" : growth.momentum.charAt(0).toUpperCase() + growth.momentum.slice(1);
  const peerDelta = peer ? round2(metrics.engagementRate - peer.metrics.engagementRate) : null;
  const peerInsight = hasStoredEngagement
    ? `this site's stored measurement from ${storedOn}, not today's public posts`
    : noPublicPosts
      ? "not comparable because this account's posts were not exposed"
      : peerDelta === null
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
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const avatarUrl = failedAvatarUrl === profile.profilePictureUrl ? undefined : profile.profilePictureUrl;

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
          <div
            data-testid="profile-avatar"
            className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600"
          >
            {avatarUrl ? (
              <Image
                key={avatarUrl}
                src={avatarUrl}
                alt={`${profile.displayName} profile picture`}
                fill
                sizes="64px"
                className="object-cover"
                referrerPolicy="no-referrer"
                onError={() => setFailedAvatarUrl(profile.profilePictureUrl ?? null)}
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-xl font-bold text-white">
                {initials}
              </span>
            )}
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
              @{profile.username} ·{" "}
              {isInstagramCategory(profile.category)
                ? profile.category
                : (inferExplicitCategory(profile) ?? profile.category)}
            </p>
            {profile.tracking ? (
              <p data-testid="tracking-since" className="mt-1 text-xs text-slate-500">
                Tracking since {formatDate(`${profile.tracking.since}T00:00:00Z`)} ·{" "}
                {profile.tracking.points.length.toLocaleString("en-US")} daily{" "}
                {profile.tracking.points.length === 1 ? "snapshot" : "snapshots"}
              </p>
            ) : null}
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
            value={describeFakeFollowers(metrics)}
            note={
              metrics.followerAudit?.census
                ? `Checked all ${metrics.followerAudit.sampleSize.toLocaleString("en-US")} followers from the owner's follower list`
                : metrics.followerAudit
                  ? `Audit of ${metrics.followerAudit.sampleSize.toLocaleString("en-US")} sampled followers · 95% range`
                  : metrics.authenticityEstimated
                    ? "Modeled range from public signals, not a count"
                    : profile.followers > 0 && profile.followers < MIN_MODEL_FOLLOWERS
                      ? "Too few followers to estimate (under 1,000). The owner can connect and upload a follower list for an exact check."
                      : undefined
            }
          />
        </div>
      </section>

      {noPublicPosts ? (
        <div
          data-testid="no-posts-notice"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {hasStoredEngagement && metrics.storedEngagement ? (
            <>
              Instagram did not expose this account&apos;s posts on this lookup. Engagement rate,
              average likes, and average comments below are this site&apos;s own measurement from
              public posts on <strong>{storedOn}</strong>, the most recent stored snapshot with
              visible posts. Reels, fake followers, authenticity, and follower growth from posts
              remain unavailable. A dash (—) means the data was not exposed, not zero.
            </>
          ) : (
            <>
              Instagram did not expose this account&apos;s posts to its public pages on this lookup,
              so engagement and modeled metrics cannot be calculated yet. A dash (—) means the data
              was not exposed, not zero. The follower, following, and total post counts are public.
              Try again in a few minutes, or connect the official API for accounts you manage.
            </>
          )}
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
            : profile.connectedInsights
              ? "This account's owner connected it to this site, so audience demographics, reach, views, saves and shares below come from Instagram Insights. Followers, likes and comments are public data. Fake followers, authenticity, and 12-month growth remain modeled estimates."
              : hasStoredEngagement
              ? `Instagram hid this account's posts on this lookup. Saves, reach, and audience demographics are not exposed. The engagement figures are this site's stored measurement from ${storedOn}; fake followers, authenticity, and growth are not modeled without public posts.`
              : profile.source === "public"
                ? "Public web data from Instagram's public profile page. Saves, reach, audience demographics, and measured follower history are not exposed. Fake followers, authenticity, and 12-month growth are modeled estimates from public signals when posts are visible."
                : "Official API data via Instagram Business Discovery. Saves, reach, audience demographics, and measured follower history are not exposed. Fake followers, authenticity, and 12-month growth are modeled estimates from public signals when posts are visible."}
        </div>
      ) : null}

      <section data-testid="metric-grid" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard
          label="Engagement rate"
          value={engagementUnavailable ? "—" : formatPercent(metrics.engagementRate)}
          badge={hasStoredEngagement ? "Stored" : undefined}
          hint={
            engagementUnavailable
              ? "No public posts available"
              : hasStoredEngagement
                ? `Measured ${storedOn} · likes + comments / followers`
                : `${
                    metrics.engagementBasis === "likes+comments"
                      ? "Public likes + comments / followers"
                      : "Avg likes + comments + saves / followers"
                  }${
                    metrics.typicalEngagementRate === null
                      ? ""
                      : ` · typical post ${formatPercent(metrics.typicalEngagementRate)}`
                  }${
                    metrics.hiddenLikePosts > 0
                      ? ` · ${metrics.hiddenLikePosts} post${metrics.hiddenLikePosts === 1 ? "" : "s"} with hidden likes excluded`
                      : ""
                  }`
          }
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
                : growth.measuredFromSnapshots
                  ? "Measured from stored snapshots"
                  : "Last two monthly points"
          }
        />
        <MetricCard
          label="Authenticity"
          value={formatPercent(metrics.authenticityPct)}
          badge={metrics.authenticityEstimated ? "Est." : undefined}
          hint={
            metrics.followerAudit?.census
              ? "100 - share flagged in the full follower check"
              : metrics.followerAudit
                ? "100 - flagged share of sampled followers"
                : metrics.authenticityEstimated
                  ? "100 - modeled fake follower share"
                  : metrics.authenticityPct === null
                    ? profile.followers > 0 && profile.followers < MIN_MODEL_FOLLOWERS
                      ? "Too few followers to estimate"
                      : "Not available from public data"
                : "100 - fake follower share"
          }
        />
        <MetricCard
          label="Avg likes"
          value={engagementUnavailable ? "—" : formatCompact(metrics.avgLikes)}
          badge={hasStoredEngagement ? "Stored" : undefined}
          hint={
            engagementUnavailable
              ? "No public posts available"
              : hasStoredEngagement
                ? `Measured ${storedOn} · average per post`
                : metrics.hiddenLikePosts > 0
                  ? "Average of posts that show likes"
                  : "Average per public post"
          }
        />
        <MetricCard
          label="Avg comments"
          value={engagementUnavailable ? "—" : formatCompact(metrics.avgComments)}
          badge={hasStoredEngagement ? "Stored" : undefined}
          hint={
            engagementUnavailable
              ? "No public posts available"
              : hasStoredEngagement
                ? `Measured ${storedOn} · average per post`
                : "Average per public post"
          }
        />
      </section>

      {indexPosition ? (
        <IndexPositionCard position={indexPosition} engagementRate={metrics.engagementRate} />
      ) : null}

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
                : `${growth.growthEstimated ? "≈ " : ""}${growth.monthGrowthFollowers >= 0 ? "+" : ""}${growth.monthGrowthFollowers.toLocaleString("en-US")} followers ${growth.growthEstimated ? "(Est.)" : ""}`}
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
              Reels in last 30 days
            </p>
            <p className="mt-2 text-xl font-semibold text-slate-950">
              {noPublicPosts ? "—" : growth.reelsLast30Days}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {noPublicPosts
                ? "Recent reels not exposed"
                : growth.postsInWindowCapped
                  ? "Latest 12 public posts checked; total may be higher"
                  : "Visible public media only"}
            </p>
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
        ) : profile.tracking && profile.tracking.points.length >= 2 ? (
          <TrackingHistoryPanel tracking={profile.tracking} followers={profile.followers} />
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
              {profile.tracking
                ? `Daily tracking started ${formatDate(`${profile.tracking.since}T00:00:00Z`)}. The measured history chart and follower-change table appear after the second daily snapshot. `
                : ""}
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
                    <td className="py-3 pr-4 text-right">
                      {likesVisible(post) ? formatCompact(post.likes) : "Hidden"}
                    </td>
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

      {profile.connectedInsights ? (
        <section
          data-testid="connected-insights"
          className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-950">Verified Instagram Insights</h3>
            </div>
            <p className="text-xs text-slate-500">
              Shared by @{profile.username} · last {profile.connectedInsights.windowDays} days ·
              updated {formatDate(`${profile.connectedInsights.capturedOn}T00:00:00Z`)}
            </p>
          </div>
          <dl className="mt-4 grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
            {(
              [
                ["Reach", profile.connectedInsights.reach],
                ["Views", profile.connectedInsights.views],
                ["Accounts engaged", profile.connectedInsights.accountsEngaged],
                ["Interactions", profile.connectedInsights.totalInteractions],
                ["Saves", profile.connectedInsights.saves],
                ["Shares", profile.connectedInsights.shares],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="mt-1 text-lg font-semibold text-slate-950">{formatCompact(value)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[11px] text-slate-400">
            From Instagram Insights via the account owner&apos;s own connection, not estimated. A dash
            (—) means Instagram did not return that metric.
          </p>
        </section>
      ) : null}

      {profile.audience ? (
        <section data-testid="audience" className="rounded-2xl border border-slate-200 bg-white p-6">
          {profile.connectedInsights ? (
            <p className="mb-4 text-xs text-slate-500">
              Follower demographics from Instagram Insights, shared by @{profile.username}. Instagram
              returns the top values only, so shares are of those values.
            </p>
          ) : null}
          <div className="grid gap-6 md:grid-cols-3">
            <AudienceBars title="Top countries" slices={profile.audience.topCountries} />
            <AudienceBars title="Age groups" slices={profile.audience.ageGroups} />
            <AudienceBars title="Gender" slices={profile.audience.gender} />
          </div>
        </section>
      ) : null}

      {/* Both benchmarks share one area: same-country peers on the left half and
          Middle East peers on the right, up to ten profiles side by side. */}
      <div
        data-testid="benchmarks"
        className={showRegionalBenchmark ? "grid gap-6 xl:grid-cols-2 xl:items-start" : "grid gap-6"}
      >
      <section
        data-testid="peer-benchmark"
        className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
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
              Closest category peers and where this profile ranks
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              We match this profile only to real public accounts in the same or a closely related
              category (for example Digital creator, Blogger, Public figure, or Beauty). {benchmarkScope}{" "}
              The group is ranked by followers, engagement rate, average likes, average comments and
              follower change. Country uses Instagram’s published “Account based in” value first;
              when it is not shared, it is inferred from public post/reel hashtags and locations,
              then handle and profile text. Peers come from tracked accounts and profiles this site has
              looked up, not an exhaustive niche search.
            </p>
          </div>
        </div>

        {peer ? (
          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center xl:grid-cols-1 2xl:grid-cols-[1fr_auto]">
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
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                  {peer.category}
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
              {peer.band ? (
                <p className="text-xs text-slate-500">
                  Follower range used: {peer.band.label}
                  {peer.joinedLabel ? ` · Peer's ${peer.joinedLabel.toLowerCase()}` : ""}
                </p>
              ) : null}
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
                  Rank #{ranking.targetRank} of {ranking.total} profiles
                </p>
                <p className="text-xs text-slate-500">
                  Rank score: 55% followers, 20% engagement, 10% avg likes, 5% avg comments, 10%
                  follower change
                </p>
                {noPublicPosts ? (
                  <p className="mt-1 text-[11px] text-amber-700">
                    {hasStoredEngagement
                      ? `Posts were not exposed. Engagement uses this site's stored measurement from ${storedOn}; growth and Reels are unavailable.`
                      : "This profile's post-based signals were not exposed, so its score reflects only the public signals available."}
                  </p>
                ) : null}
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
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
                      <InstagramLink
                        username={row.profile.username}
                        className="text-slate-400 hover:text-indigo-600"
                      />
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      @{row.profile.username} · {row.category} ·{" "}
                      {formatCompact(row.profile.followers)} followers
                      {row.matchScore !== null ? ` · ${row.matchScore.toFixed(0)}% match` : ""}
                    </p>
                    <p className="truncate text-[11px] text-slate-400">
                      {row.country.label} · {engagementSignal(formatCompact(row.avgLikes), row)} avg likes ·{" "}
                      {engagementSignal(formatCompact(row.avgComments), row)} avg comments ·{" "}
                      {changeSignal(formatPercent(row.followerChangePct), row)}
                      {row.followerChangeEstimated ? " est." : ""} follower change
                      {row.isTarget && row.engagementSource === "stored-snapshot"
                        ? ` · engagement stored ${storedOn}`
                        : ""}
                      {!row.isTarget && row.postsNotExposed ? " · posts not exposed" : ""}
                      {row.fill ? ` · ${RANK_FILL_LABEL[row.fill]}` : ""}
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
                      {engagementSignal(formatPercent(row.engagementRate), row)} ER
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">
            {benchmarkCountry
              ? `No public account in the same country (${benchmarkCountry}) and a similar category is available right now. Check back shortly.`
              : "No public account in a similar category is available right now. Check back shortly."}
          </p>
        )}
      </section>

      {showRegionalBenchmark ? (
        <section
          data-testid="regional-benchmark"
          className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <MapPin className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
                Middle East category benchmark
              </p>
              <h3 className="mt-1 text-base font-semibold text-slate-950">
                Closest Middle East profile and where this account sits
              </h3>
            </div>
          </div>

          {regionalPeer ? (
            <>
              <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center xl:grid-cols-1 2xl:grid-cols-[1fr_auto]">
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
                    <InstagramLink
                      username={regionalPeer.profile.username}
                      className="text-emerald-600 hover:text-emerald-800"
                    />
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      {regionalPeer.matchScore}% regional match
                    </span>
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      {regionalPeer.category}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {regionalPeer.country.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">@{regionalPeer.profile.username}</p>
                  {regionalPeer.sharedActivity.length > 0 ? (
                    <p className="text-xs text-slate-500">
                      Shared activity: {regionalPeer.sharedActivity.join(", ")}
                    </p>
                  ) : null}
                  {regionalPeer.band ? (
                    <p className="text-xs text-slate-500">
                      Follower range used: {regionalPeer.band.label}
                      {regionalPeer.joinedLabel
                        ? ` · Peer's ${regionalPeer.joinedLabel.toLowerCase()}`
                        : ""}
                    </p>
                  ) : null}
                  <p className="text-xs leading-relaxed text-slate-600">
                    Why this peer: {regionalPeer.matchReasons.join(", ")}.
                  </p>
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
                {regionalComparison.map((comparison) => {
                  const unavailablePostMetric =
                    metrics.engagementSource === "unavailable" &&
                    ["Engagement rate", "Avg likes", "Avg comments"].includes(comparison.label);
                  const hidden =
                    noPublicPosts &&
                    (comparison.label === "Follower change" || unavailablePostMetric);
                  return (
                    <div
                      key={comparison.label}
                      className="grid grid-cols-[1.2fr_1fr_1fr_1.4fr] gap-2 border-b border-slate-100 px-4 py-3 text-xs last:border-0"
                    >
                      <span className="font-medium text-slate-700">{comparison.label}</span>
                      <span className="font-semibold text-slate-950">
                        {hidden ? "—" : comparison.target}
                      </span>
                      <span className="font-semibold text-slate-950">{comparison.peer}</span>
                      <span className="text-slate-500">
                        {hidden
                          ? comparison.label === "Follower change"
                            ? "Not available"
                            : "Posts not exposed"
                          : comparison.insight}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                {hasStoredEngagement
                  ? `Engagement rate, avg likes, and avg comments for this profile are this site's stored measurement from ${storedOn}. Follower change is unavailable without public posts.`
                  : noPublicPosts
                    ? "Post-based values are unavailable because this account's posts were not exposed."
                    : "Follower change is modeled from public signals for non-demo profiles; see the estimates panel below for details."}
              </p>
            </>
          ) : (
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">
              No Middle East profile in the same category is tracked yet. Peers appear as
              more accounts in this category are looked up or tracked.
            </p>
          )}

          {regionalRanking ? (
            <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    Rank #{regionalRanking.targetRank} of {regionalRanking.total} of similar Middle East profiles
                  </p>
                  <p className="text-xs text-slate-500">
                    Regional rank score · estimated authenticity adjusts rank when available
                  </p>
                  {regionalRanking.band ? (
                    <p className="mt-1 text-[11px] text-slate-500">
                      Follower range used: {regionalRanking.band.label}
                    </p>
                  ) : null}
                  {noPublicPosts ? (
                    <p className="mt-1 text-[11px] text-amber-700">
                      {hasStoredEngagement
                        ? `Posts were not exposed. Engagement uses this site's stored measurement from ${storedOn}; growth and Reels are unavailable.`
                        : "This profile's post-based signals were not exposed, so its score reflects only the public signals available."}
                    </p>
                  ) : null}
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
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
                        <InstagramLink
                          username={row.profile.username}
                          className="text-emerald-600 hover:text-emerald-800"
                        />
                      </div>
                      <p className="truncate text-xs text-slate-500">
                        @{row.profile.username} · {row.category} ·{" "}
                        {formatCompact(row.profile.followers)} followers
                        {row.matchScore !== null ? ` · ${row.matchScore}% match` : ""}
                      </p>
                      <p className="truncate text-[11px] text-slate-400">
                        {row.country.label} · {engagementSignal(formatCompact(row.avgLikes), row)} avg likes ·{" "}
                        {engagementSignal(formatCompact(row.avgComments), row)} avg comments ·{" "}
                        {changeSignal(formatPercent(row.followerChangePct), row)}
                        {row.followerChangeEstimated ? " est." : ""} follower change
                        {row.isTarget && row.engagementSource === "stored-snapshot"
                          ? ` · engagement stored ${storedOn}`
                          : ""}
                        {!row.isTarget && row.postsNotExposed ? " · posts not exposed" : ""}
                      {row.fill ? ` · ${RANK_FILL_LABEL[row.fill]}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-slate-950">
                        {row.rankScore.toFixed(1)}
                      </p>
                      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                        Regional rank score
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        {engagementSignal(formatPercent(row.engagementRate), row)} ER
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">
              No Middle East ranking in this category yet. It appears once a same-category
              peer with a published Middle East location is tracked.
            </p>
          )}
        </section>
      ) : null}
      </div>
    </div>
  );
}
