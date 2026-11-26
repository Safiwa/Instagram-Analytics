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
  PDFString,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { ESTIMATE_CONFIDENCE_LABEL } from "../../core/analytics/estimates";
import { engagementTrend, postsPerWeek } from "../../core/analytics/estimates";
import { computeMetrics, describeFakeFollowers, type ProfileMetrics } from "../../core/analytics/metrics";
import { likesVisible } from "../../core/analytics/posts";
import type { CreatorProfile, Post } from "../../core/data/types";
import { inferCountrySignal } from "../../core/analytics/country";
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

const SITE_URL = "https://www.instagram-analytics.com";
const PAGE_MARGIN = 36;
const INNER_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const GOOD = rgb(0.06, 0.6, 0.42);
const WARN = rgb(0.85, 0.47, 0.04);

function postUrl(profile: CreatorProfile, post: Post): string {
  return post.permalink && /^https:\/\/(www\.)?instagram\.com\//.test(post.permalink)
    ? post.permalink
    : instagramProfileUrl(profile.username);
}

function interactions(post: Post): number {
  return (likesVisible(post) ? post.likes : 0) + post.comments;
}

// Typical engagement for an account's size, used only to phrase an insight.
function typicalEngagement(followers: number): number {
  if (followers < 10_000) return 4;
  if (followers < 100_000) return 2.5;
  if (followers < 1_000_000) return 1.5;
  return 1;
}

type Insight = { tone: "good" | "warn" | "neutral"; text: string };

function profileInsights(profile: CreatorProfile, metrics: ProfileMetrics): Insight[] {
  const insights: Insight[] = [];
  if (engagementAvailable(profile, metrics)) {
    const typical = typicalEngagement(profile.followers);
    const rate = metrics.engagementRate;
    insights.push(
      rate >= typical
        ? {
            tone: "good",
            text: `Engagement ${formatPercent(rate)} is above the ~${typical}% typical for accounts of this size.`,
          }
        : {
            tone: "warn",
            text: `Engagement ${formatPercent(rate)} is below the ~${typical}% typical for accounts of this size.`,
          },
    );
  } else {
    insights.push({
      tone: "neutral",
      text: "No posts are exposed by the public source, so engagement is N/A rather than zero.",
    });
  }
  const trend = engagementTrend(profile.recentPosts);
  if (trend !== null) {
    insights.push({
      tone: trend >= 0 ? "good" : "warn",
      text: `Interactions on the latest posts are ${trend >= 0 ? "up" : "down"} ${Math.abs(trend).toFixed(0)}% versus earlier posts.`,
    });
  }
  const byType = new Map<string, number[]>();
  for (const post of profile.recentPosts) {
    byType.set(post.type, [...(byType.get(post.type) ?? []), interactions(post)]);
  }
  const formats = [...byType.entries()]
    .map(([type, values]) => ({ type, avg: values.reduce((a, b) => a + b, 0) / values.length, n: values.length }))
    .sort((a, b) => b.avg - a.avg);
  if (formats.length > 1) {
    insights.push({
      tone: "neutral",
      text: `${formats[0].type}s earn the most interactions (avg ${formatCompact(formats[0].avg)} across ${formats[0].n} post${formats[0].n === 1 ? "" : "s"}).`,
    });
  }
  const cadence = postsPerWeek(profile.recentPosts);
  if (cadence !== null && insights.length < 4) {
    insights.push({
      tone: cadence >= 2 ? "good" : "warn",
      text: `Posting ${cadence.toFixed(1)} times a week${cadence < 2 ? "; 3+ a week usually sustains reach" : ""}.`,
    });
  }
  return insights.slice(0, 4);
}

// One A4 page: header, identity, KPIs, a clickable interactions chart, top
// posts, insights and a short disclosure. Comparisons get one page too.
// Handles, bars, posts and the dashboard button are clickable links.
export async function buildReport(profiles: CreatorProfile[]): Promise<ReportResult> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Instagram analysis: ${profiles.map((profile) => `@${profile.username}`).join(", ")}`);
  pdf.setAuthor(REPORT_BRAND);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page: PDFPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

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
      return 0;
    }
    const drawn = maxWidth === undefined ? safe : truncateToWidth(safe, font, size, maxWidth);
    page.drawText(drawn, { x, y: top - size, size, font, color });
    return font.widthOfTextAtSize(drawn, size);
  };

  const link = (x: number, bottom: number, width: number, height: number, url: string) => {
    const annotation = pdf.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x, bottom, x + width, bottom + height],
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
    });
    page.node.addAnnot(pdf.context.register(annotation));
  };

  const linkText = (value: string, url: string, x: number, top: number, size = 8, color = ACCENT, font = bold) => {
    const width = text(value, x, top, size, font, color);
    page.drawLine({
      start: { x, y: top - size - 1.5 },
      end: { x: x + width, y: top - size - 1.5 },
      thickness: 0.4,
      color,
    });
    link(x, top - size - 3, width, size + 4, url);
    return width;
  };

  const sectionTitle = (title: string, top: number, hint?: string) => {
    page.drawRectangle({ x: PAGE_MARGIN, y: top - 11, width: 2.5, height: 11, color: ACCENT });
    const width = text(title, PAGE_MARGIN + 7, top, 9.5, bold, INK);
    if (hint) {
      text(hint, PAGE_MARGIN + 7 + width + 8, top - 1.5, 7, regular, MUTED);
    }
    return top - 17;
  };

  const badge = (label: string, x: number, top: number, color = ACCENT, background = ACCENT_SOFT) => {
    const width = bold.widthOfTextAtSize(toAscii(label, ""), 6.5) + 10;
    page.drawRectangle({ x, y: top - 12, width, height: 12, color: background, borderWidth: 0.4, borderColor: color });
    text(label, x + 5, top - 3, 6.5, bold, color);
    return width;
  };

  const kpi = (x: number, top: number, width: number, label: string, value: string, note?: string, highlight = false) => {
    const height = 40;
    page.drawRectangle({
      x,
      y: top - height,
      width,
      height,
      color: highlight ? CYAN_SOFT : PANEL,
      borderWidth: 0.5,
      borderColor: highlight ? CYAN : RULE,
    });
    text(label, x + 7, top - 7, 6, bold, MUTED, width - 14);
    text(value, x + 7, top - 18, 12, bold, highlight ? ACCENT : INK, width - 14);
    if (note) {
      text(note, x + 7, top - 32, 5.5, regular, MUTED, width - 14);
    }
  };

  const avatarImage = async (url?: string): Promise<PDFImage | null> => {
    if (!url) return null;
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      return null;
    }
    if (target.protocol !== "https:" || !isAllowedAvatarHost(target.hostname)) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(target.href, {
        headers: { Accept: "image/png,image/jpeg" },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > 5_000_000) return null;
      const type = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (type.includes("image/png") || (bytes[0] === 0x89 && bytes[1] === 0x50)) return await pdf.embedPng(bytes);
      if (type.includes("image/jpeg") || (bytes[0] === 0xff && bytes[1] === 0xd8)) return await pdf.embedJpg(bytes);
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  const avatar = (image: PDFImage | null, profile: CreatorProfile, x: number, bottom: number, diameter: number) => {
    const radius = diameter / 2;
    const cx = x + radius;
    const cy = bottom + radius;
    const k = 0.5522847498;
    page.drawCircle({ x: cx, y: cy, size: radius, color: ACCENT_SOFT, borderWidth: 1, borderColor: ACCENT });
    if (image) {
      const scale = Math.max(diameter / image.width, diameter / image.height);
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
        x: cx - (image.width * scale) / 2,
        y: cy - (image.height * scale) / 2,
        width: image.width * scale,
        height: image.height * scale,
      });
      page.pushOperators(popGraphicsState());
      return;
    }
    const initials = initialsFor(profile);
    const size = diameter * 0.32;
    text(initials, cx - bold.widthOfTextAtSize(initials, size) / 2, cy + size / 2, size, bold, ACCENT);
  };

  const rows = profiles.map((profile) => ({ profile, metrics: computeMetrics(profile) }));
  const generated = new Date().toISOString().slice(0, 10);
  const dashboardUrl =
    profiles.length === 1
      ? `${SITE_URL}/profile/${encodeURIComponent(profiles[0].username)}`
      : `${SITE_URL}/compare?handles=${profiles.map((profile) => encodeURIComponent(profile.username)).join(",")}`;

  // Header band with the live-dashboard button.
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 70, width: PAGE_WIDTH, height: 70, color: INK });
  text(REPORT_BRAND, PAGE_MARGIN, PAGE_HEIGHT - 16, 8, bold, CYAN, INNER_WIDTH - 150);
  text(
    profiles.length === 1 ? "Instagram Analysis Report" : "Instagram Comparison Report",
    PAGE_MARGIN,
    PAGE_HEIGHT - 30,
    17,
    bold,
    WHITE,
  );
  text(
    `Generated ${generated} | ${sourceLabel(profiles)} | ${profiles.length} profile${profiles.length === 1 ? "" : "s"}`,
    PAGE_MARGIN,
    PAGE_HEIGHT - 53,
    7.5,
    regular,
    rgb(0.75, 0.8, 0.9),
  );
  const buttonLabel = "Open live dashboard >";
  const buttonWidth = bold.widthOfTextAtSize(buttonLabel, 8) + 18;
  const buttonX = PAGE_WIDTH - PAGE_MARGIN - buttonWidth;
  page.drawRectangle({ x: buttonX, y: PAGE_HEIGHT - 47, width: buttonWidth, height: 20, color: ACCENT });
  text(buttonLabel, buttonX + 9, PAGE_HEIGHT - 33, 8, bold, WHITE);
  link(buttonX, PAGE_HEIGHT - 47, buttonWidth, 20, dashboardUrl);

  let y = PAGE_HEIGHT - 86;

  if (profiles.length === 1) {
    const { profile, metrics } = rows[0];

    // Identity.
    const diameter = 46;
    avatar(await avatarImage(profile.profilePictureUrl), profile, PAGE_MARGIN, y - diameter, diameter);
    const idX = PAGE_MARGIN + diameter + 12;
    const idWidth = INNER_WIDTH - diameter - 12;
    text(toAscii(profile.displayName, `@${profile.username}`), idX, y - 2, 14, bold, INK, idWidth);
    let lineX = idX;
    lineX += linkText(`@${profile.username}`, instagramProfileUrl(profile.username), lineX, y - 20, 8.5) + 4;
    const country = inferCountrySignal(profile).country;
    text(
      `| ${toAscii(profile.category, "Uncategorized")} | ${country ?? "Country not published"}`,
      lineX,
      y - 20,
      8.5,
      regular,
      MUTED,
      idWidth - (lineX - idX),
    );
    let badgeX = idX;
    badgeX += badge(profile.isVerified ? "Verified" : "Not verified", badgeX, y - 33) + 5;
    badgeX += badge(profileSourceLabel(profile), badgeX, y - 33, INK_SOFT, PANEL) + 5;
    if (metrics.growthEstimated || metrics.authenticityEstimated) {
      badge("Includes est. values", badgeX, y - 33, WARN, rgb(1, 0.96, 0.9));
    }
    y -= diameter + 6;
    if (profile.bio) {
      const bio = wrapText(profile.bio, regular, 7.5, INNER_WIDTH).slice(0, 2);
      for (const [index, content] of bio.entries()) {
        text(index === 1 && wrapText(profile.bio, regular, 7.5, INNER_WIDTH).length > 2 ? `${content}...` : content, PAGE_MARGIN, y, 7.5, regular, INK_SOFT);
        y -= 10;
      }
    }
    y -= 6;

    // KPIs: two rows of four.
    y = sectionTitle("Key metrics", y, "est. = modeled from public signals; N/A = not published");
    const gap = 6;
    const cardWidth = (INNER_WIDTH - gap * 3) / 4;
    const trend = engagementTrend(profile.recentPosts);
    const cadence = postsPerWeek(profile.recentPosts);
    const cards: [string, string, string?, boolean?][] = [
      ["FOLLOWERS", formatCompact(profile.followers, "N/A"), `${formatCompact(profile.following, "N/A")} following`],
      [
        metrics.storedEngagement ? "ENGAGEMENT (STORED)" : "ENGAGEMENT RATE",
        engagementValue(profile, metrics),
        `typical ~${typicalEngagement(profile.followers)}% at this size`,
        true,
      ],
      ["AVG LIKES", postMetric(metrics.avgLikes, profile.recentPosts), `per post, ${profile.recentPosts.length} posts`],
      ["AVG COMMENTS", postMetric(metrics.avgComments, profile.recentPosts), "per post"],
      ["POSTS / WEEK", cadence === null ? "N/A" : cadence.toFixed(1), `${formatCompact(profile.postsCount, "N/A")} posts total`],
      ["INTERACTION TREND", trend === null ? "N/A" : `${trend > 0 ? "+" : ""}${trend.toFixed(1)}%`, "latest vs earlier posts"],
      [
        "FAKE FOLLOWERS",
        describeFakeFollowers(metrics, "N/A").replace(/\s*\(.*\)$/, ""),
        metrics.authenticityEstimated ? "est." : metrics.fakeFollowers === null ? "not estimated" : "measured",
      ],
      [
        "12-MONTH GROWTH",
        formatPercent(metrics.followerGrowthPct, "N/A"),
        metrics.growthEstimated ? "est." : metrics.followerGrowthPct === null ? "not published" : "measured",
      ],
    ];
    cards.forEach(([label, value, note, highlight], index) => {
      const column = index % 4;
      const row = Math.floor(index / 4);
      kpi(PAGE_MARGIN + column * (cardWidth + gap), y - row * 46, cardWidth, label, value, note, highlight);
    });
    y -= 46 * 2 + 8;

    // Interactions chart, oldest to newest; each bar opens its post.
    const posts = [...profile.recentPosts].slice(0, 12).reverse();
    y = sectionTitle("Interactions per post", y, posts.length > 0 ? "likes + comments | click a bar to open the post" : undefined);
    const chartHeight = 92;
    if (posts.length === 0) {
      text(
        "No posts are exposed by the public source. Engagement-related averages are shown as N/A, not zeros.",
        PAGE_MARGIN,
        y,
        8,
        regular,
        MUTED,
      );
      y -= 18;
    } else {
      const max = Math.max(...posts.map(interactions), 1);
      const slot = INNER_WIDTH / posts.length;
      const barWidth = Math.min(slot * 0.62, 30);
      const base = y - chartHeight;
      page.drawLine({ start: { x: PAGE_MARGIN, y: base }, end: { x: PAGE_WIDTH - PAGE_MARGIN, y: base }, thickness: 0.5, color: RULE });
      const average = posts.reduce((sum, post) => sum + interactions(post), 0) / posts.length;
      const averageY = base + (average / max) * (chartHeight - 14);
      page.drawLine({
        start: { x: PAGE_MARGIN, y: averageY },
        end: { x: PAGE_WIDTH - PAGE_MARGIN, y: averageY },
        thickness: 0.5,
        color: CYAN,
        dashArray: [3, 2],
      });
      text(`avg ${formatCompact(average)}`, PAGE_WIDTH - PAGE_MARGIN - 40, averageY + 9, 6, bold, CYAN);
      posts.forEach((post, index) => {
        const value = interactions(post);
        const height = Math.max(1.5, (value / max) * (chartHeight - 14));
        const x = PAGE_MARGIN + index * slot + (slot - barWidth) / 2;
        page.drawRectangle({ x, y: base, width: barWidth, height, color: value >= average ? ACCENT : rgb(0.66, 0.64, 0.96) });
        const label = formatCompact(value);
        text(label, x + barWidth / 2 - regular.widthOfTextAtSize(label, 5.5) / 2, base + height + 8, 5.5, regular, INK_SOFT);
        const date = formatDate(post.postedAt, false);
        text(date, x + barWidth / 2 - regular.widthOfTextAtSize(date, 5.5) / 2, base - 3, 5.5, regular, MUTED);
        link(x, base, barWidth, Math.max(height, 12), postUrl(profile, post));
      });
      y = base - 16;
    }

    // Top posts.
    const top = [...profile.recentPosts].sort((a, b) => interactions(b) - interactions(a)).slice(0, 3);
    if (top.length > 0) {
      y = sectionTitle("Top posts", y, "by interactions | click to open");
      for (const [index, post] of top.entries()) {
        if (index % 2 === 0) {
          page.drawRectangle({ x: PAGE_MARGIN, y: y - 17, width: INNER_WIDTH, height: 18, color: PANEL });
        }
        const cells: [string, number, PDFFont, typeof INK][] = [
          [`${index + 1}. ${formatDate(post.postedAt, false)}`, 62, bold, INK],
          [post.type, 46, regular, INK_SOFT],
          [`${likesVisible(post) ? formatCompact(post.likes) : "Hidden"} likes`, 70, regular, INK_SOFT],
          [`${formatCompact(post.comments)} comments`, 74, regular, INK_SOFT],
        ];
        let x = PAGE_MARGIN + 5;
        for (const [value, width, font, color] of cells) {
          text(value, x, y - 5, 7.5, font, color, width - 6);
          x += width;
        }
        const openWidth = 34;
        text(post.caption || post.hashtags.join(" ") || "No caption", x, y - 5, 7.5, regular, MUTED, PAGE_WIDTH - PAGE_MARGIN - x - openWidth - 6);
        linkText("Open >", postUrl(profile, post), PAGE_WIDTH - PAGE_MARGIN - openWidth, y - 5, 7.5);
        y -= 19;
      }
      y -= 6;
    }

    // Insights.
    y = sectionTitle("Key insights", y);
    for (const insight of profileInsights(profile, metrics)) {
      const color = insight.tone === "good" ? GOOD : insight.tone === "warn" ? WARN : ACCENT;
      page.drawCircle({ x: PAGE_MARGIN + 4, y: y - 4, size: 2.4, color });
      const lines = wrapText(insight.text, regular, 8, INNER_WIDTH - 14).slice(0, 2);
      for (const content of lines) {
        text(content, PAGE_MARGIN + 12, y, 8, regular, INK_SOFT);
        y -= 11;
      }
      y -= 2;
    }
    if (profile.audience && profile.audience.topCountries.length > 0) {
      y -= 2;
      text(
        `Audience (Instagram Insights): ${profile.audience.topCountries
          .slice(0, 3)
          .map((slice) => `${slice.label} ${slice.percentage}%`)
          .join(", ")}`,
        PAGE_MARGIN,
        y,
        7.5,
        regular,
        MUTED,
        INNER_WIDTH,
      );
      y -= 12;
    }
  } else {
    // Comparison: one row per profile, then an engagement bar chart.
    y = sectionTitle("Side-by-side", y, "click a handle to open its live dashboard");
    const columns = [
      { label: "PROFILE", width: 118 },
      { label: "FOLLOWERS", width: 56 },
      { label: "ENGAGEMENT", width: 62 },
      { label: "AVG LIKES", width: 54 },
      { label: "AVG COMMENTS", width: 62 },
      { label: "POSTS/WK", width: 46 },
      { label: "12M GROWTH", width: 58 },
      { label: "AUTHENTICITY", width: INNER_WIDTH - 456 },
    ];
    page.drawRectangle({ x: PAGE_MARGIN, y: y - 15, width: INNER_WIDTH, height: 15, color: ACCENT_SOFT });
    let headerX = PAGE_MARGIN + 5;
    for (const column of columns) {
      text(column.label, headerX, y - 4.5, 6, bold, ACCENT, column.width - 6);
      headerX += column.width;
    }
    y -= 17;
    const maxRows = Math.min(rows.length, 20);
    for (const [index, { profile, metrics }] of rows.slice(0, maxRows).entries()) {
      if (index % 2 === 1) {
        page.drawRectangle({ x: PAGE_MARGIN, y: y - 16, width: INNER_WIDTH, height: 17, color: PANEL });
      }
      let x = PAGE_MARGIN + 5;
      linkText(`@${profile.username}`, `${SITE_URL}/profile/${encodeURIComponent(profile.username)}`, x, y - 4, 7.5);
      x += columns[0].width;
      const cadence = postsPerWeek(profile.recentPosts);
      const cells = [
        formatCompact(profile.followers, "N/A"),
        engagementValue(profile, metrics),
        postMetric(metrics.avgLikes, profile.recentPosts),
        postMetric(metrics.avgComments, profile.recentPosts),
        cadence === null ? "N/A" : cadence.toFixed(1),
        formatPercent(metrics.followerGrowthPct, "N/A") + (metrics.growthEstimated ? " est." : ""),
        formatPercent(metrics.authenticityPct, "N/A") + (metrics.authenticityEstimated ? " est." : ""),
      ];
      cells.forEach((cell, cellIndex) => {
        text(cell, x, y - 4, 7.5, regular, INK_SOFT, columns[cellIndex + 1].width - 6);
        x += columns[cellIndex + 1].width;
      });
      y -= 18;
    }
    if (rows.some(({ profile }) => profile.recentPosts.length === 0)) {
      text("No posts are exposed by the public source for some profiles; their averages are N/A, not zeros.", PAGE_MARGIN, y, 7, regular, MUTED);
      y -= 12;
    }
    y -= 8;

    const measured = rows.filter(({ profile, metrics }) => engagementAvailable(profile, metrics));
    if (measured.length > 0) {
      y = sectionTitle("Engagement rate", y, "click a bar to open the profile");
      const max = Math.max(...measured.map(({ metrics }) => metrics.engagementRate), 0.01);
      const labelWidth = 110;
      const barMax = INNER_WIDTH - labelWidth - 50;
      for (const { profile, metrics } of [...measured].sort((a, b) => b.metrics.engagementRate - a.metrics.engagementRate).slice(0, 12)) {
        text(`@${profile.username}`, PAGE_MARGIN, y, 7.5, regular, INK_SOFT, labelWidth - 6);
        const width = Math.max(2, (metrics.engagementRate / max) * barMax);
        page.drawRectangle({ x: PAGE_MARGIN + labelWidth, y: y - 9, width, height: 9, color: ACCENT });
        text(formatPercent(metrics.engagementRate), PAGE_MARGIN + labelWidth + width + 5, y - 1, 7, bold, INK);
        link(PAGE_MARGIN + labelWidth, y - 9, width, 9, instagramProfileUrl(profile.username));
        y -= 15;
      }
      y -= 6;
    }

    y = sectionTitle("Key insights", y);
    const leaders: string[] = [];
    const largest = [...rows].sort((a, b) => b.profile.followers - a.profile.followers)[0];
    leaders.push(`Largest audience: @${largest.profile.username} with ${formatCompact(largest.profile.followers)} followers.`);
    if (measured.length > 0) {
      const best = [...measured].sort((a, b) => b.metrics.engagementRate - a.metrics.engagementRate)[0];
      leaders.push(`Highest engagement: @${best.profile.username} at ${formatPercent(best.metrics.engagementRate)}.`);
    }
    const growing = rows.filter(({ metrics }) => metrics.followerGrowthPct !== null);
    if (growing.length > 0) {
      const fastest = [...growing].sort((a, b) => (b.metrics.followerGrowthPct ?? 0) - (a.metrics.followerGrowthPct ?? 0))[0];
      leaders.push(
        `Fastest 12-month growth: @${fastest.profile.username} at ${formatPercent(fastest.metrics.followerGrowthPct)}${fastest.metrics.growthEstimated ? " (est.)" : ""}.`,
      );
    }
    for (const leader of leaders) {
      page.drawCircle({ x: PAGE_MARGIN + 4, y: y - 4, size: 2.4, color: ACCENT });
      text(leader, PAGE_MARGIN + 12, y, 8, regular, INK_SOFT, INNER_WIDTH - 14);
      y -= 13;
    }
  }

  // Footer: short disclosure, brand and page count.
  const footerTop = FOOTER_TOP + 30;
  page.drawLine({ start: { x: PAGE_MARGIN, y: footerTop }, end: { x: PAGE_WIDTH - PAGE_MARGIN, y: footerTop }, thickness: 0.5, color: RULE });
  const disclosure = wrapText(
    "Measured: followers, posts, likes and comments from public posts (at most 12 recent). est. values are modeled from public signals; N/A means Instagram did not publish the value, never zero. Unofficial analysis of public information; not affiliated with Meta.",
    regular,
    6.5,
    INNER_WIDTH,
  ).slice(0, 2);
  disclosure.forEach((content, index) => text(content, PAGE_MARGIN, footerTop - 6 - index * 8.5, 6.5, regular, MUTED));
  page.drawText(REPORT_BRAND, { x: PAGE_MARGIN, y: FOOTER_TOP - 8, size: 7, font: bold, color: ACCENT });
  const pageLabel = "Page 1 of 1";
  page.drawText(pageLabel, {
    x: PAGE_WIDTH - PAGE_MARGIN - regular.widthOfTextAtSize(pageLabel, 7),
    y: FOOTER_TOP - 8,
    size: 7,
    font: regular,
    color: MUTED,
  });

  const bytes = await pdf.save();
  const filename = `ig-analysis-${profiles.map((profile) => profile.username).join("-")}.pdf`;
  return { bytes, filename };
}
