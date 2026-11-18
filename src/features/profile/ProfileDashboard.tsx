"use client";

import Link from "next/link";
import {
  BadgeCheck,
  Download,
  GitCompareArrows,
  Layers3,
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
import type { ProfileMetrics } from "../../core/analytics/metrics";
import type { AudienceSlice, CreatorProfile } from "../../core/data/types";
import { formatCompact, formatDate, formatPercent } from "../../core/format";

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  fontSize: 12,
};

const SOURCE_LABEL: Record<CreatorProfile["source"], string> = {
  demo: "Demo data",
  public: "Public web",
  live: "Official API",
};

const SOURCE_BADGE_CLASS: Record<CreatorProfile["source"], string> = {
  demo: "bg-slate-100 text-slate-600",
  public: "bg-sky-50 text-sky-700",
  live: "bg-emerald-50 text-emerald-700",
};

type ProfileDashboardProps = {
  profile: CreatorProfile;
  metrics: ProfileMetrics;
};

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-sm font-semibold text-slate-950">{value}</p>
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

export function ProfileDashboard({ profile, metrics }: ProfileDashboardProps) {
  const interactions = profile.recentPosts.map((post) => ({
    label: formatDate(post.postedAt, false),
    likes: post.likes,
    comments: post.comments,
    saves: post.saves,
  }));
  const hasSaves = metrics.avgSaves !== null;
  const hasViews = profile.recentPosts.some((post) => typeof post.viewCount === "number");

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
              {profile.isVerified ? (
                <BadgeCheck className="h-5 w-5 text-indigo-600" aria-label="Verified" />
              ) : null}
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span>@{profile.username} · {profile.category}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${SOURCE_BADGE_CLASS[profile.source]}`}
              >
                {SOURCE_LABEL[profile.source]}
              </span>
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
            value={formatCompact(profile.fakeFollowers)}
          />
        </div>
      </section>

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
            ? "This account is private. Public follower and post counts are available, but posts and engagement are hidden."
            : profile.source === "public"
              ? "Public web data from Instagram's public profile page. Saves, reach, audience demographics, follower history, and fake-follower estimates are not exposed. Likes and comments come from public post embeds."
              : "Official API data via Instagram Business Discovery. Saves, reach, audience demographics, fake-follower estimates, and follower history are not exposed for public accounts."}
        </div>
      ) : null}

      <section data-testid="metric-grid" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Engagement rate"
          value={profile.isPrivate ? "—" : formatPercent(metrics.engagementRate)}
          hint={
            profile.isPrivate
              ? "Posts are hidden"
              : metrics.engagementBasis === "likes+comments"
                ? "Public likes + comments / followers"
                : "Avg interactions / followers"
          }
        />
        <MetricCard
          label="12-month growth"
          value={formatPercent(metrics.followerGrowthPct)}
          hint={
            metrics.followerGrowthPct === null
              ? "Not exposed for public accounts"
              : "First to last monthly point"
          }
        />
        <MetricCard
          label="Authenticity"
          value={formatPercent(metrics.authenticityPct)}
          hint={
            metrics.authenticityPct === null
              ? "Not exposed for public accounts"
              : "100 - fake follower share"
          }
        />
        <MetricCard
          label="Avg interactions"
          value={profile.isPrivate ? "—" : formatCompact(metrics.avgLikes + metrics.avgComments + (metrics.avgSaves ?? 0))}
          hint={
            profile.isPrivate
              ? "Posts are hidden"
              : metrics.engagementBasis === "likes+comments"
                ? "Likes + comments"
                : "Likes + comments + saves"
          }
        />
      </section>

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
            <p className="text-xs text-slate-500">Not exposed publicly</p>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Instagram publishes the current follower count, but not historical follower counts
              for public accounts.
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
              No public posts were returned, so there are no interactions to chart.
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
                    No public media was returned for this account.
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
    </div>
  );
}
