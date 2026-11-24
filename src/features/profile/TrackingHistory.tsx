"use client";

import { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { IndexPosition } from "../../core/analytics/benchmark";
import { followerChanges, pointsInRange } from "../../core/analytics/history";
import type { TrackingHistory as History } from "../../core/data/types";
import { formatCompact, formatDate, formatPercent } from "../../core/format";

const RANGES = [
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "1Y", days: 365 },
] as const;

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  fontSize: 12,
};

function dayLabel(date: string): string {
  return formatDate(`${date}T00:00:00Z`, false);
}

function signed(value: number, formatted: string): string {
  return value > 0 ? `+${formatted}` : formatted;
}

// Daily follower and engagement history measured by this site's own collector.
export function TrackingHistoryPanel({
  tracking,
  followers,
}: {
  tracking: History;
  followers: number;
}) {
  const [range, setRange] = useState<(typeof RANGES)[number]["days"]>(90);
  const visible = pointsInRange(tracking.points, range).map((point) => ({
    ...point,
    label: dayLabel(point.date),
  }));
  const changes = followerChanges(tracking.points, followers);
  const hasEngagement = visible.some((point) => point.engagementRate !== null);

  return (
    <div data-testid="tracking-history" className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Follower history</h3>
          <p className="text-xs text-slate-500">
            Measured daily by this site since {formatDate(`${tracking.since}T00:00:00Z`)} ·{" "}
            {tracking.points.length.toLocaleString("en-US")} snapshots
          </p>
        </div>
        <div className="flex rounded-lg border border-slate-200 p-0.5" role="group" aria-label="Range">
          {RANGES.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => setRange(option.days)}
              aria-pressed={range === option.days}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                range === option.days ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={visible} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="trackingFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis
              yAxisId="followers"
              domain={["auto", "auto"]}
              tickFormatter={(value) => formatCompact(Number(value))}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={56}
            />
            {hasEngagement ? (
              <YAxis
                yAxisId="engagement"
                orientation="right"
                tickFormatter={(value) => `${Number(value).toFixed(1)}%`}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
            ) : null}
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value, name) =>
                name === "engagementRate"
                  ? [formatPercent(Number(value)), "Engagement rate"]
                  : [Number(value).toLocaleString("en-US"), "Followers"]
              }
            />
            <Area
              yAxisId="followers"
              type="monotone"
              dataKey="followers"
              stroke="#4f46e5"
              strokeWidth={2}
              fill="url(#trackingFill)"
            />
            {hasEngagement ? (
              <Line
                yAxisId="engagement"
                type="monotone"
                dataKey="engagementRate"
                stroke="#f59e0b"
                strokeWidth={1.5}
                dot={false}
                connectNulls={false}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        Indigo: followers{hasEngagement ? " · Amber: engagement rate (right axis)" : ""}
      </p>

      <table data-testid="follower-changes" className="mt-4 w-full text-left text-sm">
        <thead className="text-[10px] uppercase tracking-wider text-slate-500">
          <tr>
            <th className="pb-2 font-medium">Window</th>
            <th className="pb-2 text-right font-medium">Followers</th>
            <th className="pb-2 text-right font-medium">Change</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((change) => (
            <tr key={change.window} className="border-t border-slate-100">
              <td className="py-2 text-slate-600">
                {change.window === 1 ? "1 day" : `${change.window} days`}
              </td>
              <td className="py-2 text-right font-medium text-slate-950">
                {change.followers === null
                  ? "—"
                  : signed(change.followers, change.followers.toLocaleString("en-US"))}
              </td>
              <td
                className={`py-2 text-right font-medium ${
                  change.pct === null
                    ? "text-slate-400"
                    : change.pct >= 0
                      ? "text-emerald-700"
                      : "text-rose-700"
                }`}
              >
                {change.pct === null ? "Not enough history" : signed(change.pct, formatPercent(change.pct))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Where this profile's engagement sits among same-size profiles in the index.
export function IndexPositionCard({
  position,
  engagementRate,
}: {
  position: IndexPosition;
  engagementRate: number;
}) {
  const marker = Math.min(98, Math.max(2, position.percentile));
  return (
    <section
      data-testid="index-position"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-950">Engagement vs our index</h3>
        <p className="text-xs text-slate-500">
          {position.sampleSize} {position.tier.label} creators ({position.tier.followers} followers)
          measured in the last 30 days
        </p>
      </div>
      <p className="mt-2 text-2xl font-semibold text-indigo-700">
        {position.percentile}
        <span className="text-sm font-medium text-slate-500"> percentile</span>
      </p>
      <div className="relative mt-3 h-2 rounded-full bg-gradient-to-r from-slate-200 via-indigo-200 to-indigo-500">
        <span
          className="absolute -top-1 h-4 w-1 rounded bg-slate-950"
          style={{ left: `${marker}%` }}
          aria-hidden="true"
        />
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {formatPercent(engagementRate)} engagement vs a tier median of {formatPercent(position.median)}{" "}
        (middle half {formatPercent(position.p25)}-{formatPercent(position.p75)}). Higher than{" "}
        {position.percentile}% of indexed {position.tier.label.toLowerCase()} creators.
      </p>
    </section>
  );
}
