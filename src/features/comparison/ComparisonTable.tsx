import Link from "next/link";
import { ArrowUpRight, Download, TriangleAlert } from "lucide-react";
import { ESTIMATE_CONFIDENCE_LABEL } from "../../core/analytics/estimates";
import type { ProfileMetrics } from "../../core/analytics/metrics";
import type { CreatorProfile } from "../../core/data/types";
import { formatCompact, formatPercent } from "../../core/format";

export type ComparisonRow = {
  profile: CreatorProfile;
  metrics: ProfileMetrics;
};

type ComparisonTableProps = {
  rows: ComparisonRow[];
  truncated: boolean;
  missing: string[];
};

const SOURCE_LABEL: Record<CreatorProfile["source"], string> = {
  demo: "Demo dataset",
  public: "Public web",
  live: "Official API",
};

function withEstimate(value: string, estimated: boolean): string {
  return estimated ? `${value} est.` : value;
}

function estimateBasis(row: ComparisonRow): string {
  if (row.metrics.estimateConfidence) {
    return `${ESTIMATE_CONFIDENCE_LABEL[row.metrics.estimateConfidence]} confidence`;
  }
  if (row.profile.source === "demo") {
    return "Demo fixture";
  }
  return "Not available";
}

const metricRows: { label: string; value: (row: ComparisonRow) => string }[] = [
  { label: "Followers", value: (row) => formatCompact(row.profile.followers) },
  {
    label: "Fake-follower estimate",
    value: (row) =>
      withEstimate(
        formatCompact(row.metrics.fakeFollowers, "N/A"),
        row.metrics.authenticityEstimated,
      ),
  },
  { label: "Engagement rate", value: (row) => formatPercent(row.metrics.engagementRate) },
  {
    label: "12-month growth",
    value: (row) =>
      withEstimate(
        formatPercent(row.metrics.followerGrowthPct, "N/A"),
        row.metrics.growthEstimated,
      ),
  },
  {
    label: "Authenticity",
    value: (row) =>
      withEstimate(
        formatPercent(row.metrics.authenticityPct, "N/A"),
        row.metrics.authenticityEstimated,
      ),
  },
  { label: "Avg likes", value: (row) => formatCompact(row.metrics.avgLikes) },
  { label: "Avg comments", value: (row) => formatCompact(row.metrics.avgComments) },
  { label: "Avg saves", value: (row) => formatCompact(row.metrics.avgSaves, "N/A") },
  { label: "Category", value: (row) => row.profile.category },
  { label: "Posts", value: (row) => formatCompact(row.profile.postsCount) },
  {
    label: "Source",
    value: (row) => SOURCE_LABEL[row.profile.source],
  },
  { label: "Estimate basis", value: (row) => estimateBasis(row) },
];

export function ComparisonTable({ rows, truncated, missing }: ComparisonTableProps) {
  const handles = rows.map((row) => row.profile.username).join(",");
  const hasLive = rows.some((row) => row.profile.source === "live");
  const hasPublic = rows.some((row) => row.profile.source === "public");
  const privateRows = rows.filter((row) => row.profile.isPrivate);
  const notices = [
    ...(truncated ? ["Only the first four handles are shown."] : []),
    ...(missing.length > 0 ? [`Unavailable handles skipped: ${missing.join(", ")}.`] : []),
    ...(privateRows.length > 0
      ? [
          `Private accounts show follower counts only and have no modeled estimates: ${privateRows
            .map((row) => `@${row.profile.username}`)
            .join(", ")}.`,
        ]
      : []),
    ...(hasPublic
      ? [
          "Public-web rows use Instagram public profile pages. Saves, audience demographics, and measured follower history are unavailable; fake followers, authenticity, and growth are modeled estimates when posts are visible.",
        ]
      : []),
    ...(hasLive
      ? [
          "Official-API rows use Business Discovery. Saves, audience demographics, and measured follower history are unavailable; fake followers, authenticity, and growth are modeled estimates when posts are visible.",
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      {notices.length > 0 ? (
        <div
          data-testid="compare-notice"
          className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{notices.join(" ")}</span>
        </div>
      ) : null}

      <a
        href={`/api/report?handles=${handles}`}
        className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Download PDF report
      </a>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table data-testid="comparison-table" className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Metric
              </th>
              {rows.map((row) => (
                <th
                  key={row.profile.username}
                  data-testid="compare-column"
                  className="px-5 py-4 align-top"
                >
                  <Link
                    href={`/profile/${row.profile.username}`}
                    className="group inline-flex items-center gap-1 text-sm font-semibold text-slate-950 transition hover:text-indigo-600"
                  >
                    {row.profile.displayName}
                    <ArrowUpRight className="h-3 w-3 text-slate-400 group-hover:text-indigo-600" aria-hidden="true" />
                  </Link>
                  <p className="mt-0.5 text-xs font-normal text-slate-500">
                    @{row.profile.username}
                  </p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {metricRows.map((metric) => (
              <tr key={metric.label}>
                <th className="px-5 py-4 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  {metric.label}
                </th>
                {rows.map((row) => (
                  <td key={row.profile.username} className="px-5 py-4 font-medium text-slate-900">
                    {metric.value(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
