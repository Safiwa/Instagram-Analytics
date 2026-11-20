import type { ProfileMetrics } from "../analytics/metrics";
import { formatCompact, formatPercent } from "../format";

export const SITE_URL = "https://www.instagram-analytics.com";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function signed(value: number, formatted: string): string {
  if (value > 0) {
    return `+${formatted}`;
  }
  if (value < 0) {
    return `-${formatted}`;
  }
  return formatted;
}

export type DigestEmailInput = {
  handle: string;
  displayName: string;
  followers: number;
  metrics: ProfileMetrics;
  sentAt: Date;
  previous?: {
    followers?: number;
    engagementRate?: number;
  };
  unsubscribeUrl: string;
};

export function buildDigestEmail(input: DigestEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const safeHandle = escapeHtml(input.handle);
  const safeName = escapeHtml(input.displayName || input.handle);
  const engagement = formatPercent(input.metrics.engagementRate);
  const growth = formatPercent(input.metrics.followerGrowthPct);
  const growthLabel = input.metrics.growthEstimated ? `${growth} (Est.)` : growth;
  const profileUrl = `${SITE_URL}/profile/${encodeURIComponent(input.handle)}`;
  const unsubscribeUrl = escapeHtml(input.unsubscribeUrl);
  const week = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(input.sentAt);

  const followerDelta =
    typeof input.previous?.followers === "number"
      ? input.followers - input.previous.followers
      : null;
  const followerDeltaPct =
    followerDelta !== null && input.previous?.followers
      ? (followerDelta / input.previous.followers) * 100
      : null;
  const followerChange =
    followerDelta === null
      ? "First report - comparison starts next week"
      : `${signed(followerDelta, formatCompact(Math.abs(followerDelta)))}${
          followerDeltaPct === null
            ? ""
            : ` (${signed(followerDeltaPct, `${Math.abs(followerDeltaPct).toFixed(2)}%`)})`
        }`;

  const engagementDelta =
    typeof input.previous?.engagementRate === "number"
      ? input.metrics.engagementRate - input.previous.engagementRate
      : null;
  const engagementChange =
    engagementDelta === null
      ? "First report - comparison starts next week"
      : `${signed(engagementDelta, `${Math.abs(engagementDelta).toFixed(2)} pp`)}`;

  const subject = `Weekly Instagram Analytics digest for @${input.handle}`;

  const text = [
    `Your weekly Instagram Analytics digest - ${week}`,
    "",
    `Profile: ${input.displayName || input.handle} (@${input.handle})`,
    `Followers: ${formatCompact(input.followers)}`,
    `Followers vs last week: ${followerChange}`,
    `Engagement rate: ${engagement}`,
    `Engagement rate vs last week: ${engagementChange}`,
    `12-month follower growth: ${growthLabel}`,
    "",
    "Engagement rate is measured from public post likes, comments, and available saves.",
    "Follower growth is a disclosed public-signal estimate when Instagram does not publish history.",
    "Week-over-week changes compare public counts from this report with the previous report.",
    "",
    `Full analysis: ${profileUrl}`,
    "",
    "Received this because you signed up for the free 30-day weekly digest.",
    `Unsubscribe: ${input.unsubscribeUrl}`,
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5">
      <h2 style="margin:0 0 4px">Your weekly Instagram Analytics digest</h2>
      <p style="margin:0 0 20px;color:#64748b">${week}</p>
      <p style="margin:0 0 16px"><strong>${safeName}</strong> (@${safeHandle})</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px">
        <tr>
          <td style="padding:10px 18px 10px 0;border-bottom:1px solid #e2e8f0;color:#475569">Followers</td>
          <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-weight:600">${formatCompact(input.followers)}</td>
        </tr>
        <tr>
          <td style="padding:10px 18px 10px 0;border-bottom:1px solid #e2e8f0;color:#475569">Followers vs last week</td>
          <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-weight:600">${escapeHtml(followerChange)}</td>
        </tr>
        <tr>
          <td style="padding:10px 18px 10px 0;border-bottom:1px solid #e2e8f0;color:#475569">Engagement rate</td>
          <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-weight:600">${engagement}</td>
        </tr>
        <tr>
          <td style="padding:10px 18px 10px 0;border-bottom:1px solid #e2e8f0;color:#475569">Engagement rate vs last week</td>
          <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-weight:600">${escapeHtml(engagementChange)}</td>
        </tr>
        <tr>
          <td style="padding:10px 18px 10px 0;border-bottom:1px solid #e2e8f0;color:#475569">12-month follower growth</td>
          <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-weight:600">${growthLabel}</td>
        </tr>
      </table>
      <p style="margin:0 0 16px;font-size:13px;color:#475569">
        Engagement rate comes from public post interactions. Follower growth is labeled
        <strong>Est.</strong> when it is modeled from public signals. Week-over-week changes
        compare this report with the previous report.
      </p>
      <p style="margin:0 0 24px">
        <a href="${profileUrl}" style="color:#4f46e5">Open the full analysis</a>
      </p>
      <p style="margin:0;font-size:12px;color:#94a3b8">
        You signed up for the free 30-day weekly digest.
        <a href="${unsubscribeUrl}" style="color:#64748b">Unsubscribe</a>
      </p>
    </div>
  `;

  return { subject, text, html };
}
