import {
  PDFDocument,
  StandardFonts,
  appendBezierCurve,
  clip,
  closePath,
  endPath,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { ESTIMATE_CONFIDENCE_LABEL } from "../../core/analytics/estimates";
import { engagementTrend, postsPerWeek } from "../../core/analytics/estimates";
import { computeMetrics, describeFakeFollowers, type ProfileMetrics } from "../../core/analytics/metrics";
import { likesVisible } from "../../core/analytics/posts";
import type { CreatorProfile, Post } from "../../core/data/types";
import { formatCompact, formatDate, formatPercent, instagramProfileUrl } from "../../core/format";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const FOOTER_TOP = 34;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export const REPORT_BRAND = "INSTAGRAM ANALYTICS by Campaign Masters UAE";

const INK = rgb(0.06, 0.09, 0.16);
const INK_SOFT = rgb(0.16, 0.21, 0.32);
const MUTED = rgb(0.4, 0.46, 0.56);
const ACCENT = rgb(0.31, 0.27, 0.9);
const ACCENT_SOFT = rgb(0.91, 0.9, 0.99);
const CYAN = rgb(0.22, 0.78, 0.86);
const CYAN_SOFT = rgb(0.9, 0.98, 0.99);
const PANEL = rgb(0.97, 0.98, 1);
const RULE = rgb(0.87, 0.89, 0.94);
const WHITE = rgb(1, 1, 1);

export type ReportResult = {
  bytes: Uint8Array;
  filename: string;
};

type TextLike = string | number | null | undefined;

/**
 * Standard PDF fonts only cover WinAnsi, so live names and bios can contain
 * emoji or scripts that make pdf-lib throw. Keep every drawn string printable.
 */
function toAscii(value: TextLike, fallback = "N/A"): string {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : fallback;
  }
  if (typeof value !== "string") {
    return fallback;
  }

  const cleaned = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || fallback;
}

function isAllowedAvatarHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "i.instagram.com" ||
    host.endsWith(".cdninstagram.com") ||
    host.endsWith(".fbcdn.net") ||
    host === "scontent.instagram.com" ||
    /^scontent-[^.]+\.instagram\.com$/.test(host)
  );
}

function initialsFor(profile: CreatorProfile): string {
  const parts = toAscii(profile.displayName, profile.username)
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const source = parts.length > 0 ? parts : [profile.username];
  return toAscii(
    source
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join(""),
    profile.username.slice(0, 2).toUpperCase(),
  ).slice(0, 2);
}

function engagementAvailable(profile: CreatorProfile, metrics: ProfileMetrics): boolean {
  return metrics.engagementSource !== "unavailable" && profile.followers > 0;
}

function postMetric(value: number | null | undefined, posts: Post[]): string {
  if (posts.length === 0 || typeof value !== "number") {
    return "N/A";
  }
  return formatCompact(value, "N/A");
}

function engagementValue(profile: CreatorProfile, metrics: ProfileMetrics): string {
  if (!engagementAvailable(profile, metrics)) {
    return "N/A";
  }
  return formatPercent(metrics.engagementRate, "N/A");
}

function sourceLabel(profiles: CreatorProfile[]): string {
  const sources = new Set(profiles.map((profile) => profile.source));
  if (sources.has("live") && sources.has("public")) {
    return "Mixed public sources";
  }
  if (sources.has("live")) {
    return "Live public data";
  }
  if (sources.has("public")) {
    return "Public web data";
  }
  return "Demo dataset";
}

function profileSourceLabel(profile: CreatorProfile): string {
  if (profile.source === "demo") {
    return "Demo fixture";
  }
  if (profile.source === "live") {
    return "Live public data";
  }
  return "Public web data";
}

function truncateToWidth(text: string, font: PDFFont, size: number, maxWidth: number): string {
  const safe = toAscii(text, "");
  if (!safe || font.widthOfTextAtSize(safe, size) <= maxWidth) {
    return safe;
  }

  let value = safe;
  while (value.length > 1 && font.widthOfTextAtSize(`${value}...`, size) > maxWidth) {
    value = value.slice(0, -1);
  }
  return `${value.trimEnd()}...`;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const safe = toAscii(text, "");
  if (!safe) {
    return [];
  }

  const lines: string[] = [];
  let current = "";
  for (const word of safe.split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = "";
    }
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      continue;
    }
    let chunk = "";
    for (const character of word) {
      if (font.widthOfTextAtSize(chunk + character, size) > maxWidth && chunk) {
        lines.push(chunk);
        chunk = "";
      }
      chunk += character;
    }
    current = chunk;
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

export async function buildReport(profiles: CreatorProfile[]): Promise<ReportResult> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const pages: PDFPage[] = [page];
  let y = PAGE_HEIGHT - 52;

  const addPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    y = PAGE_HEIGHT - 52;
    page.drawText(truncateToWidth(REPORT_BRAND, bold, 8, CONTENT_WIDTH / 2), {
      x: MARGIN,
      y: y - 8,
      size: 8,
      font: bold,
      color: ACCENT,
    });
    page.drawText("Instagram Profile Analytics Report", {
      x: PAGE_WIDTH - MARGIN - 150,
      y: y - 8,
      size: 8,
      font: regular,
      color: MUTED,
    });
    y -= 24;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.7,
      color: RULE,
    });
    y -= 18;
  };

  const ensureSpace = (height: number) => {
    if (y - height < FOOTER_TOP + 16) {
      addPage();
    }
  };

  const text = (
    value: TextLike,
    x: number,
    top: number,
    size = 9,
    font: PDFFont = regular,
    color = INK,
    maxWidth?: number,
  ) => {
    const safe = toAscii(value, "");
    if (!safe) {
      return;
    }
    const drawn =
      maxWidth === undefined ? safe : truncateToWidth(safe, font, size, maxWidth);
    page.drawText(drawn, { x, y: top - size, size, font, color });
  };

  const line = (
    value: TextLike,
    size = 9,
    font: PDFFont = regular,
    color = INK,
    gap = 6,
    x = MARGIN,
    maxWidth = CONTENT_WIDTH,
  ) => {
    ensureSpace(size + gap);
    text(value, x, y, size, font, color, maxWidth);
    y -= size + gap;
  };

  const paragraph = (
    value: TextLike,
    size = 9,
    color = INK_SOFT,
    gap = 5,
    x = MARGIN,
    width = CONTENT_WIDTH,
    maxLines?: number,
  ) => {
    const lines = wrapText(toAscii(value, ""), regular, size, width);
    const visible = maxLines === undefined ? lines : lines.slice(0, maxLines);
    for (const [index, content] of visible.entries()) {
      const isLast = index === visible.length - 1;
      const suffix = maxLines !== undefined && lines.length > maxLines ? "..." : "";
      line(
        `${content}${suffix}`,
        size,
        regular,
        color,
        isLast ? gap : 3,
        x,
        width,
      );
    }
  };

  const section = (title: string, subtitle?: string) => {
    ensureSpace(subtitle ? 46 : 32);
    page.drawRectangle({ x: MARGIN, y: y - 21, width: 3, height: 21, color: ACCENT });
    text(title, MARGIN + 10, y, 13, bold, INK, CONTENT_WIDTH - 10);
    y -= 18;
    if (subtitle) {
      text(subtitle, MARGIN + 10, y, 8, regular, MUTED, CONTENT_WIDTH - 10);
      y -= 14;
    }
    y -= 8;
  };

  const badge = (label: string, x: number, top: number, color = ACCENT, background = ACCENT_SOFT) => {
    const size = 7;
    const labelWidth = Math.min(
      bold.widthOfTextAtSize(toAscii(label, ""), size) + 12,
      CONTENT_WIDTH,
    );
    page.drawRectangle({
      x,
      y: top - 13,
      width: labelWidth,
      height: 13,
      color: background,
      borderWidth: 0.5,
      borderColor: color,
    });
    text(label, x + 6, top - 2.5, size, bold, color);
    return labelWidth;
  };

  const kpiCard = (
    x: number,
    top: number,
    width: number,
    label: string,
    value: string,
    highlight = false,
  ) => {
    const height = 48;
    page.drawRectangle({
      x,
      y: top - height,
      width,
      height,
      color: highlight ? CYAN_SOFT : PANEL,
      borderWidth: 0.6,
      borderColor: highlight ? CYAN : RULE,
    });
    text(label, x + 8, top - 12, 6.5, bold, MUTED, width - 16);
    text(value, x + 8, top - 29, 12, bold, highlight ? ACCENT : INK, width - 16);
  };

  const drawCircularAvatar = (
    image: PDFImage | null,
    profile: CreatorProfile,
    x: number,
    bottom: number,
    diameter: number,
  ) => {
    const radius = diameter / 2;
    const cx = x + radius;
    const cy = bottom + radius;
    const k = 0.5522847498;

    page.drawCircle({
      x: cx,
      y: cy,
      size: radius,
      color: ACCENT_SOFT,
      borderWidth: 1,
      borderColor: ACCENT,
    });

    if (image) {
      const scale = Math.max(diameter / image.width, diameter / image.height);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      page.pushOperators(
        pushGraphicsState(),
        moveTo(cx, cy + radius),
        appendBezierCurve(cx + k * radius, cy + radius, cx + radius, cy + k * radius, cx + radius, cy),
        appendBezierCurve(cx + radius, cy - k * radius, cx + k * radius, cy - radius, cx, cy - radius),
        appendBezierCurve(cx - k * radius, cy - radius, cx - radius, cy - k * radius, cx - radius, cy),
        appendBezierCurve(cx - radius, cy + k * radius, cx - k * radius, cy + radius, cx, cy + radius),
        closePath(),
        clip(),
        endPath(),
      );
      page.drawImage(image, {
        x: cx - drawWidth / 2,
        y: cy - drawHeight / 2,
        width: drawWidth,
        height: drawHeight,
      });
      page.pushOperators(popGraphicsState());
      page.drawCircle({
        x: cx,
        y: cy,
        size: radius,
        borderWidth: 1,
        borderColor: WHITE,
      });
      return;
    }

    const initials = initialsFor(profile);
    const initialsWidth = bold.widthOfTextAtSize(initials, 12);
    text(initials, cx - initialsWidth / 2, cy + 6, 12, bold, ACCENT, diameter - 4);
  };

  const loadAvatar = async (url?: string): Promise<PDFImage | null> => {
    if (!url) {
      return null;
    }

    let target: URL;
    try {
      target = new URL(url);
    } catch {
      return null;
    }
    if (target.protocol !== "https:" || !isAllowedAvatarHost(target.hostname)) {
      return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(target.href, {
        headers: { Accept: "image/png,image/jpeg" },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        return null;
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > 5_000_000) {
        return null;
      }

      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      const isPng =
        contentType.includes("image/png") ||
        (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47);
      const isJpg =
        contentType.includes("image/jpeg") ||
        (bytes[0] === 0xff && bytes[1] === 0xd8);

      if (isPng) {
        return await pdf.embedPng(bytes);
      }
      if (isJpg) {
        return await pdf.embedJpg(bytes);
      }
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  const reportRows = profiles.map((profile) => ({ profile, metrics: computeMetrics(profile) }));
  const hasEstimates = reportRows.some((row) => row.metrics.estimateConfidence !== null);
  const hasThirdParty = reportRows.some((row) => row.metrics.thirdPartyEngagement !== null);
  const label = sourceLabel(profiles);
  const generated = new Date().toISOString().slice(0, 10);

  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 96, width: PAGE_WIDTH, height: 96, color: INK });
  text(REPORT_BRAND, MARGIN, PAGE_HEIGHT - 30, 11, bold, WHITE, CONTENT_WIDTH);
  text("Instagram Analysis Report", MARGIN, PAGE_HEIGHT - 60, 22, bold, WHITE, CONTENT_WIDTH);
  text(
    `Generated ${generated} | ${label} | ${profiles.length} profile${profiles.length === 1 ? "" : "s"}`,
    MARGIN,
    PAGE_HEIGHT - 82,
    8.5,
    regular,
    CYAN,
    CONTENT_WIDTH,
  );
  y = PAGE_HEIGHT - 122;

  section("Executive summary", "What this report covers and how the figures should be read");
  const totalFollowers = profiles.reduce((sum, profile) => sum + profile.followers, 0);
  const measuredProfiles = reportRows.filter((row) => engagementAvailable(row.profile, row.metrics));
  const averageEngagement =
    measuredProfiles.length > 0
      ? measuredProfiles.reduce((sum, row) => sum + row.metrics.engagementRate, 0) /
        measuredProfiles.length
      : null;
  const strongest =
    measuredProfiles.length > 0
      ? [...measuredProfiles].sort((a, b) => b.metrics.engagementRate - a.metrics.engagementRate)[0]
      : null;

  paragraph(
    `This dossier reviews ${profiles.length} Instagram account${profiles.length === 1 ? "" : "s"} using ${label.toLowerCase()}. It combines public account facts, post-level engagement, growth and authenticity disclosures, and a source-aware comparison. Values Instagram does not publish are shown as N/A, not as zero.`,
    9,
    INK_SOFT,
    8,
  );

  const summaryCardHeight = 58;
  ensureSpace(summaryCardHeight + 10);
  const summaryCardTop = y;
  page.drawRectangle({
    x: MARGIN,
    y: y - summaryCardHeight,
    width: CONTENT_WIDTH,
    height: summaryCardHeight,
    color: PANEL,
    borderWidth: 0.6,
    borderColor: RULE,
  });
  const summaryWidth = CONTENT_WIDTH / 3;
  text("COMBINED FOLLOWERS", MARGIN + 10, y - 12, 6.5, bold, MUTED, summaryWidth - 20);
  text(
    formatCompact(totalFollowers, "N/A"),
    MARGIN + 10,
    y - 30,
    13,
    bold,
    INK,
    summaryWidth - 20,
  );
  text("AVG ENGAGEMENT", MARGIN + summaryWidth + 10, y - 12, 6.5, bold, MUTED, summaryWidth - 20);
  text(
    averageEngagement === null ? "N/A" : formatPercent(averageEngagement, "N/A"),
    MARGIN + summaryWidth + 10,
    y - 30,
    13,
    bold,
    INK,
    summaryWidth - 20,
  );
  const leaderLabel = strongest ? `@${strongest.profile.username}` : "Not available";
  text(
    "HIGHEST ENGAGEMENT",
    MARGIN + summaryWidth * 2 + 10,
    y - 12,
    6.5,
    bold,
    MUTED,
    summaryWidth - 20,
  );
  text(
    leaderLabel,
    MARGIN + summaryWidth * 2 + 10,
    y - 30,
    11,
    bold,
    ACCENT,
    summaryWidth - 20,
  );
  y = summaryCardTop - summaryCardHeight - 14;

  if (hasThirdParty) {
    line(
      "Third-party engagement figures in this report are estimates from a named external calculator, not Instagram measurements.",
      8,
      regular,
      MUTED,
      8,
    );
  }
  if (hasEstimates) {
    line(
      "Fake followers, authenticity and growth are modeled estimates wherever measured history is unavailable.",
      8,
      regular,
      MUTED,
      8,
    );
  }

  for (const [index, { profile, metrics }] of reportRows.entries()) {
    if (index > 0) {
      addPage();
    }
    section(`Profile ${index + 1}: @${profile.username}`, "Identity, headline metrics and data basis");

    const avatarTop = y;
    const avatarSize = 38;
    ensureSpace(avatarSize + 8);
    const avatar = await loadAvatar(profile.profilePictureUrl);
    drawCircularAvatar(avatar, profile, MARGIN, avatarTop - avatarSize, avatarSize);

    const identityX = MARGIN + avatarSize + 12;
    const identityWidth = CONTENT_WIDTH - avatarSize - 12;
    text(toAscii(profile.displayName, `@${profile.username}`), identityX, avatarTop - 4, 15, bold, INK, identityWidth);
    text(
      `@${profile.username} | ${toAscii(profile.category, "Uncategorized")}`,
      identityX,
      avatarTop - 22,
      9,
      regular,
      MUTED,
      identityWidth,
    );

    let badgeX = identityX;
    const verificationWidth = badge(profile.isVerified ? "Verified" : "Not verified", badgeX, avatarTop - 39);
    badgeX += verificationWidth + 6;
    const sourceWidth = badge(
      profileSourceLabel(profile),
      badgeX,
      avatarTop - 39,
      INK_SOFT,
      PANEL,
    );
    badgeX += sourceWidth + 6;
    if (metrics.growthEstimated || metrics.authenticityEstimated || metrics.thirdPartyEngagement) {
      badge(
        metrics.thirdPartyEngagement ? "Third-party estimate" : "Est. metrics",
        badgeX,
        avatarTop - 39,
        ACCENT,
        ACCENT_SOFT,
      );
    }
    y = avatarTop - avatarSize - 12;

    const kpiTop = y;
    const gap = 7;
    const cardWidth = (CONTENT_WIDTH - gap * 3) / 4;
    ensureSpace(56);
    kpiCard(MARGIN, kpiTop, cardWidth, "FOLLOWERS", formatCompact(profile.followers, "N/A"));
    kpiCard(
      MARGIN + cardWidth + gap,
      kpiTop,
      cardWidth,
      metrics.thirdPartyEngagement ? "ENGAGEMENT (3RD PARTY EST.)" : "ENGAGEMENT",
      engagementValue(profile, metrics),
      true,
    );
    kpiCard(
      MARGIN + (cardWidth + gap) * 2,
      kpiTop,
      cardWidth,
      "AUTHENTICITY",
      formatPercent(metrics.authenticityPct, "N/A") +
        (metrics.authenticityEstimated ? " est." : ""),
    );
    kpiCard(
      MARGIN + (cardWidth + gap) * 3,
      kpiTop,
      cardWidth,
      "12M GROWTH",
      formatPercent(metrics.followerGrowthPct, "N/A") + (metrics.growthEstimated ? " est." : ""),
    );
    y = kpiTop - 56 - 14;

    section("Account snapshot", "Public profile fields and measurement basis");
    line(`Following ${formatCompact(profile.following, "N/A")} | Posts ${formatCompact(profile.postsCount, "N/A")} | Public profile ${toAscii(instagramProfileUrl(profile.username), "")}`);
    line(
      `Account country ${toAscii(profile.accountCountry ?? "Not published", "")} | Website ${toAscii(profile.website ?? "Not published", "")}`,
    );
    if (profile.bio) {
      paragraph(`Bio: ${profile.bio}`, 8.5, MUTED, 8, MARGIN, CONTENT_WIDTH, 3);
    }
    if (profile.isPrivate) {
      line("Private account: posts and engagement are not exposed publicly.", 8.5, regular, MUTED, 8);
    }

    section("Engagement analysis", "Measured from visible public posts unless labeled otherwise");
    const postCount = profile.recentPosts.length;
    const trend = engagementTrend(profile.recentPosts);
    const cadence = postsPerWeek(profile.recentPosts);
    line(
      `Recent post sample ${postCount} | Avg likes ${postMetric(metrics.avgLikes, profile.recentPosts)} | Avg comments ${postMetric(metrics.avgComments, profile.recentPosts)} | Avg saves ${metrics.avgSaves === null ? "N/A" : formatCompact(metrics.avgSaves, "N/A")}`,
      8.5,
      regular,
      INK_SOFT,
      6,
    );
    line(
      `Engagement basis ${toAscii(metrics.engagementBasis.replaceAll(":", " "), "")} | Interaction trend ${trend === null ? "N/A" : `${trend > 0 ? "+" : ""}${trend.toFixed(2)}%`} | Cadence ${cadence === null ? "N/A" : `${cadence.toFixed(1)} posts/week`}`,
      8.5,
      regular,
      MUTED,
      8,
    );

    if (metrics.thirdPartyEngagement) {
      const thirdParty = metrics.thirdPartyEngagement;
      line(
        `Third-party estimate from ${toAscii(thirdParty.source, "External source")}: ${formatPercent(thirdParty.engagementRatePct, "N/A")} engagement, ${formatCompact(thirdParty.averageLikes, "N/A")} avg likes, ${formatCompact(thirdParty.averageComments, "N/A")} avg comments.`,
        8.5,
        regular,
        INK_SOFT,
        4,
      );
      line(
        `Source ${toAscii(thirdParty.sourceUrl, "")} | Report date ${toAscii(thirdParty.reportUpdatedAt, "")} | Not an Instagram measurement.`,
        8,
        regular,
        MUTED,
        8,
      );
    } else if (postCount === 0) {
      line(
        "No posts are exposed by the public source. Engagement-related averages are shown as N/A, not zeros.",
        8.5,
        regular,
        MUTED,
        8,
      );
    }

    section("Growth and authenticity", "Measured history first, disclosed estimates only where required");
    const history = profile.followerHistory;
    if (history.length >= 2) {
      line(
        `Measured history: ${toAscii(history[0].month, "")} ${formatCompact(history[0].followers, "N/A")} to ${toAscii(history[history.length - 1].month, "")} ${formatCompact(history[history.length - 1].followers, "N/A")}.`,
        8.5,
        regular,
        INK_SOFT,
        6,
      );
    }
    line(
      `12-month change ${formatPercent(metrics.followerGrowthPct, "N/A")}${metrics.growthEstimated ? " (est.)" : metrics.followerGrowthPct === null ? "" : " (measured)"} | Fake followers ${describeFakeFollowers(metrics, "N/A")}${metrics.authenticityEstimated ? " (est.)" : ""} | Authenticity ${formatPercent(metrics.authenticityPct, "N/A")}${metrics.authenticityEstimated ? " (est.)" : ""}`,
      8.5,
      regular,
      INK_SOFT,
      6,
    );

    if (metrics.estimateConfidence) {
      line(
        `Estimate confidence: ${ESTIMATE_CONFIDENCE_LABEL[metrics.estimateConfidence]}. ${toAscii(metrics.estimateMethodology ?? "", "")}`,
        8,
        regular,
        MUTED,
        5,
      );
      const signalText = metrics.estimateSignals
        .map((signal) => `${signal.label}: ${signal.value} (${signal.impact})`)
        .join(" | ");
      paragraph(`Signals: ${signalText}`, 7.5, MUTED, 8, MARGIN, CONTENT_WIDTH, 4);
    } else if (profile.source === "demo") {
      line("Demo fixture: these values are fixed for testing and are not modeled.", 8, regular, MUTED, 8);
    } else {
      line(
        "No modeled estimate is used because the public source does not expose enough evidence.",
        8,
        regular,
        MUTED,
        8,
      );
    }

    section("Recent posts", "Up to 12 public posts; saved values appear only when exposed");
    if (postCount === 0) {
      line("Recent posts are not exposed for this account.", 9, regular, MUTED, 8);
    } else {
      const columns = [
        { label: "DATE", width: 58 },
        { label: "TYPE", width: 54 },
        { label: "LIKES", width: 58 },
        { label: "COMMENTS", width: 66 },
        { label: "SAVES", width: 58 },
        { label: "CAPTION / TOPIC", width: CONTENT_WIDTH - 294 },
      ];
      const drawPostHeader = () => {
        ensureSpace(22);
        page.drawRectangle({
          x: MARGIN,
          y: y - 18,
          width: CONTENT_WIDTH,
          height: 18,
          color: ACCENT_SOFT,
        });
        let colX = MARGIN + 5;
        for (const column of columns) {
          text(column.label, colX, y - 4, 6.5, bold, ACCENT, column.width - 8);
          colX += column.width;
        }
        y -= 22;
      };
      drawPostHeader();

      for (const [postIndex, post] of profile.recentPosts.slice(0, 12).entries()) {
        if (y - 28 < FOOTER_TOP + 16) {
          addPage();
          drawPostHeader();
        }
        const rowTop = y;
        if (postIndex % 2 === 1) {
          page.drawRectangle({
            x: MARGIN,
            y: rowTop - 26,
            width: CONTENT_WIDTH,
            height: 26,
            color: PANEL,
          });
        }
        let colX = MARGIN + 5;
        const cells = [
          formatDate(post.postedAt, false),
          post.type,
          likesVisible(post) ? postMetric(post.likes, [post]) : "Hidden",
          postMetric(post.comments, [post]),
          post.saves === undefined ? "N/A" : formatCompact(post.saves, "N/A"),
          post.caption || post.hashtags.join(" ") || "No caption",
        ];
        cells.forEach((cell, cellIndex) => {
          const width = columns[cellIndex].width - 8;
          text(cell, colX, rowTop - 16, 7.5, regular, cellIndex === 5 ? MUTED : INK_SOFT, width);
          colX += columns[cellIndex].width;
        });
        y -= 28;
      }
      if (postCount >= 12) {
        line(
          "Public view exposes at most 12 recent posts; totals in this table are a sample, not the account lifetime.",
          7.5,
          regular,
          MUTED,
          8,
        );
      }
    }

    section("Audience and source limits", "What Instagram publishes and what remains unavailable");
    if (profile.audience) {
      line(
        `Top countries: ${profile.audience.topCountries
          .slice(0, 3)
          .map((slice) => `${slice.label} ${slice.percentage}%`)
          .join(" | ") || "N/A"}`,
        8.5,
        regular,
        INK_SOFT,
        4,
      );
      line(
        `Age: ${profile.audience.ageGroups
          .slice(0, 3)
          .map((slice) => `${slice.label} ${slice.percentage}%`)
          .join(" | ") || "N/A"} | Gender: ${profile.audience.gender
          .slice(0, 3)
          .map((slice) => `${slice.label} ${slice.percentage}%`)
          .join(" | ") || "N/A"}`,
        8.5,
        regular,
        MUTED,
        8,
      );
    } else {
      line(
        "Audience demographics are not published by Instagram for this account and are left blank.",
        8.5,
        regular,
        MUTED,
        8,
      );
    }
    line(
      "Saves, reach and measured follower history remain unavailable unless explicitly shown above. N/A means not exposed, never zero.",
      8,
      regular,
      MUTED,
      8,
    );
  }

  if (profiles.length > 1) {
    addPage();
    section("Side-by-side comparison", "Identical fields, source labels and honest gaps");
    const columns = [
      { label: "PROFILE", width: 126 },
      { label: "FOLLOWERS", width: 66 },
      { label: "ENGAGEMENT", width: 76 },
      { label: "12M GROWTH", width: 72 },
      { label: "AUTHENTICITY", width: 80 },
      { label: "SOURCE", width: CONTENT_WIDTH - 420 },
    ];
    const drawHeader = () => {
      ensureSpace(22);
      page.drawRectangle({
        x: MARGIN,
        y: y - 18,
        width: CONTENT_WIDTH,
        height: 18,
        color: ACCENT_SOFT,
      });
      let x = MARGIN + 5;
      for (const column of columns) {
        text(column.label, x, y - 4, 6.5, bold, ACCENT, column.width - 8);
        x += column.width;
      }
      y -= 22;
    };
    drawHeader();
    for (const [rowIndex, { profile, metrics }] of reportRows.entries()) {
      if (y - 28 < FOOTER_TOP + 16) {
        addPage();
        drawHeader();
      }
      const rowTop = y;
      if (rowIndex % 2 === 1) {
        page.drawRectangle({
          x: MARGIN,
          y: rowTop - 26,
          width: CONTENT_WIDTH,
          height: 26,
          color: PANEL,
        });
      }
      let x = MARGIN + 5;
      const cells = [
        `@${profile.username}`,
        formatCompact(profile.followers, "N/A"),
        engagementValue(profile, metrics) + (metrics.thirdPartyEngagement ? " est." : ""),
        formatPercent(metrics.followerGrowthPct, "N/A") + (metrics.growthEstimated ? " est." : ""),
        formatPercent(metrics.authenticityPct, "N/A") + (metrics.authenticityEstimated ? " est." : ""),
        profileSourceLabel(profile),
      ];
      cells.forEach((cell, cellIndex) => {
        text(cell, x, rowTop - 16, 7.5, regular, INK_SOFT, columns[cellIndex].width - 8);
        x += columns[cellIndex].width;
      });
      y -= 28;
    }
    y -= 8;
    paragraph(
      "Comparison rows use the same source-aware rules as the individual sections. Do not treat a modeled est. value or a third-party estimate as an Instagram-measured metric.",
      8,
      MUTED,
      8,
    );
  }

  addPage();
  section("Methodology and disclosures", "How to interpret this document");
  const disclosures = [
    "Measured data: follower, following and post counts plus likes, comments and any exposed saves from public posts.",
    "Modeled estimates: fake followers, authenticity and growth use disclosed public signals only when Instagram publishes no measured history. Confidence, methodology and signals are listed per profile.",
    "Third-party estimates: Modash engagement figures are external calculator values, are labeled third-party estimates, and are never mixed into the public-signal model.",
    "Unavailable values: N/A means Instagram or the named third party did not expose the value. It is not a zero and is not invented.",
    "Public sample: at most 12 recent, non-pinned posts are visible. Captions and topic labels are descriptive only and are not audience-demographic claims.",
    "Profile photos: small circular icons use the public Instagram avatar URL when it is reachable; otherwise initials are shown. No synthetic profile image is generated.",
    "Audience, saves, reach and true follower history are not published by Instagram for public lookups and remain omitted unless explicitly present above.",
  ];
  for (const disclosure of disclosures) {
    ensureSpace(30);
    page.drawCircle({ x: MARGIN + 3, y: y - 4, size: 2, color: ACCENT });
    paragraph(disclosure, 8.5, INK_SOFT, 8, MARGIN + 14, CONTENT_WIDTH - 14);
  }
  y -= 4;
  line(
    "This is an unofficial analysis of public information. Instagram is a trademark of Meta Platforms, Inc.; this report is not affiliated with or endorsed by Meta.",
    7.5,
    regular,
    MUTED,
    4,
  );

  for (const [pageIndex, reportPage] of pages.entries()) {
    reportPage.drawLine({
      start: { x: MARGIN, y: FOOTER_TOP + 8 },
      end: { x: PAGE_WIDTH - MARGIN, y: FOOTER_TOP + 8 },
      thickness: 0.5,
      color: RULE,
    });
    reportPage.drawText(REPORT_BRAND, {
      x: MARGIN,
      y: FOOTER_TOP - 4,
      size: 7,
      font: bold,
      color: ACCENT,
    });
    const pageLabel = `Page ${pageIndex + 1} of ${pages.length}`;
    reportPage.drawText(pageLabel, {
      x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(pageLabel, 7),
      y: FOOTER_TOP - 4,
      size: 7,
      font: regular,
      color: MUTED,
    });
  }

  const bytes = await pdf.save();
  const filename = `ig-analysis-${profiles.map((profile) => profile.username).join("-")}.pdf`;

  return { bytes, filename };
}
