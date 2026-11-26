"use client";

import { useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { POST_RANGES, buildPostPerformance } from "../../core/analytics/postPerformance";
import type { HistoryPost } from "../../core/data/postHistory";
import { formatCompact, formatDate, formatPercent } from "../../core/format";

const TOOLTIP_STYLE = { borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 };
const SERIES_NAMES: Record<string, string> = {
  posts: "Posts",
  avgLikes: "Avg likes",
  avgComments: "Avg comments",
  avgViews: "Avg views",
};

function bucketLabel(start: string, bucket: "week" | "month"): string {
  const date = new Date(`${start}T00:00:00Z`);
  return bucket === "month"
    ? date.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

// Post performance over 30 days, 90 days or a year, from the account's real
// posts (Instagram's current likes, comments and views for each post). Unlike
// follower history this needs no waiting: post dates go back as far as the
// account has posted.
export function PostPerformancePanel({
  history,
  followers,
  fetchedAt,
}: {
  history: HistoryPost[];
  followers: number;
  fetchedAt: string;
}) {
  const [days, setDays] = useState<(typeof POST_RANGES)[number]["days"]>(90);
  const performance = buildPostPerformance(history, days, followers, Date.parse(fetchedAt));
  const data = performance.buckets.map((bucket) => ({
    ...bucket,
    label: bucketLabel(bucket.start, performance.bucket),
  }));
  const hasViews = data.some((bucket) => bucket.avgViews !== null);
  const rangeLabel = POST_RANGES.find((option) => option.days === days)?.label ?? "";
  const rangeStart = Date.parse(fetchedAt) - days * 86_400_000;
  const partial =
    performance.oldestPost !== null && Date.parse(performance.oldestPost) > rangeStart && history.length >= 150;

  return (
    <div data-testid="post-performance" className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Post performance</h3>
          <p className="text-xs text-slate-500">
            From {history.length.toLocaleString("en-US")} public posts · Instagram&apos;s current counts ·
            updated {formatDate(fetchedAt)}
          </p>
        </div>
        <div className="flex rounded-lg border border-slate-200 p-0.5" role="group" aria-label="Post range">
          {POST_RANGES.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => setDays(option.days)}
              aria-pressed={days === option.days}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                days === option.days ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Posts" value={performance.posts.toLocaleString("en-US")} />
        <Stat label="Per week" value={performance.postsPerWeek.toFixed(1)} />
        <Stat
          label="Avg likes"
          value={performance.avgLikes === null ? "Hidden" : formatCompact(performance.avgLikes)}
        />
        <Stat label="Avg comments" value={formatCompact(performance.avgComments)} />
        <Stat
          label="Avg views"
          value={performance.avgViews === null ? "—" : formatCompact(performance.avgViews)}
        />
      </div>

      {performance.posts === 0 ? (
        <p className="mt-6 text-sm text-slate-500">No public posts in the last {rangeLabel}.</p>
      ) : (
        <div className="mt-4 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis
                yAxisId="interactions"
                tickFormatter={(value) => formatCompact(Number(value))}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={52}
              />
              <YAxis
                yAxisId="posts"
                orientation="right"
                allowDecimals={false}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={28}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value, name) => [
                  value === null || value === undefined ? "—" : Number(value).toLocaleString("en-US"),
                  SERIES_NAMES[String(name)] ?? String(name),
                ]}
              />
              <Bar yAxisId="posts" dataKey="posts" fill="#c7d2fe" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Line
                yAxisId="interactions"
                type="monotone"
                dataKey="avgLikes"
                stroke="#4f46e5"
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                yAxisId="interactions"
                type="monotone"
                dataKey="avgComments"
                stroke="#f59e0b"
                strokeWidth={1.5}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              {hasViews ? (
                <Line
                  yAxisId="interactions"
                  type="monotone"
                  dataKey="avgViews"
                  stroke="#10b981"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-500">
        Bars: posts per {performance.bucket} (right axis). Lines: average likes (indigo), comments
        (amber){hasViews ? " and reel views (green)" : ""} per post (left axis).
        {performance.engagementRate !== null
          ? ` Average interactions per post equal ${formatPercent(performance.engagementRate)} of current followers.`
          : ""}
        {partial
          ? ` Only the latest 150 posts are read, which reach back to ${formatDate(performance.oldestPost as string)}.`
          : ""}
      </p>
    </div>
  );
}
