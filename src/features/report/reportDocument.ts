import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { ESTIMATE_CONFIDENCE_LABEL } from "../../core/analytics/estimates";
import { computeMetrics } from "../../core/analytics/metrics";
import type { CreatorProfile } from "../../core/data/types";
import { formatCompact, formatPercent } from "../../core/format";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;

const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.39, 0.45, 0.55);
const ACCENT = rgb(0.31, 0.27, 0.9);
const RULE = rgb(0.88, 0.9, 0.94);

export type ReportResult = {
  bytes: Uint8Array;
  filename: string;
};

/**
 * Standard PDF fonts only cover WinAnsi, so live names and bios can contain
 * emoji or scripts that make pdf-lib throw. Keep every drawn string printable.
 */
function toAscii(value: string, fallback = "Unknown"): string {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || fallback;
}

export async function buildReport(profiles: CreatorProfile[]): Promise<ReportResult> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const ensureSpace = (height: number) => {
    if (y - height < MARGIN) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  };

  const line = (
    text: string,
    size = 10,
    font: PDFFont = regular,
    color = INK,
    gap = 6,
  ) => {
    ensureSpace(size + gap);
    page.drawText(toAscii(text, ""), { x: MARGIN, y, size, font, color });
    y -= size + gap;
  };

  const reportRows = profiles.map((profile) => ({ profile, metrics: computeMetrics(profile) }));
  const hasLive = reportRows.some((row) => row.profile.source === "live");
  const hasPublic = reportRows.some((row) => row.profile.source === "public");
  const hasEstimates = reportRows.some((row) => row.metrics.estimateConfidence !== null);
  const sourceLabel =
    hasLive && hasPublic
      ? "Mixed public sources"
      : hasLive
        ? "Live public data"
        : hasPublic
          ? "Public web data"
          : "Demo dataset";

  page.drawText("TRENDING ANALYTICS", { x: MARGIN, y, size: 10, font: bold, color: ACCENT });
  y -= 28;

  line("Instagram Analysis Report", 24, bold, INK, 10);
  line(
    `Generated ${new Date().toISOString().slice(0, 10)} | ${sourceLabel} | ${profiles.length} profile${
      profiles.length === 1 ? "" : "s"
    }`,
    9,
    regular,
    MUTED,
    16,
  );

  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.8,
    color: RULE,
  });
  y -= 16;

  for (const { profile, metrics } of reportRows) {
    ensureSpace(190);
    const displayName = toAscii(profile.displayName, `@${profile.username}`);

    page.drawText(displayName, { x: MARGIN, y, size: 15, font: bold, color: INK });
    page.drawText(toAscii(`@${profile.username} | ${profile.category}`, ""), {
      x: MARGIN,
      y: y - 14,
      size: 9,
      font: regular,
      color: MUTED,
    });
    y -= 30;

    const cells: [string, string][] = [
      ["FOLLOWERS", formatCompact(profile.followers)],
      [
        "FAKE FOLLOWERS",
        formatCompact(metrics.fakeFollowers, "N/A") +
          (metrics.authenticityEstimated ? " est." : ""),
      ],
      ["ENGAGEMENT", formatPercent(metrics.engagementRate)],
      [
        "12M GROWTH",
        formatPercent(metrics.followerGrowthPct, "N/A") + (metrics.growthEstimated ? " est." : ""),
      ],
      [
        "AUTHENTICITY",
        formatPercent(metrics.authenticityPct, "N/A") +
          (metrics.authenticityEstimated ? " est." : ""),
      ],
    ];
    const cellWidth = (PAGE_WIDTH - MARGIN * 2) / cells.length;

    cells.forEach(([label, value], index) => {
      const x = MARGIN + index * cellWidth;
      page.drawText(label, { x, y, size: 7, font: bold, color: MUTED });
      page.drawText(toAscii(value, "N/A"), { x, y: y - 15, size: 13, font: bold, color: INK });
    });
    y -= 38;

    line(
      `Avg likes ${formatCompact(metrics.avgLikes)} | Avg comments ${formatCompact(
        metrics.avgComments,
      )} | Avg saves ${formatCompact(metrics.avgSaves, "N/A")}`,
      9,
      regular,
      MUTED,
      4,
    );

    if (metrics.estimateConfidence) {
      line(
        `Estimated metrics: ${ESTIMATE_CONFIDENCE_LABEL[metrics.estimateConfidence]} confidence from public signals; not Instagram measurements.`,
        8,
        regular,
        MUTED,
        4,
      );
    }

    if (profile.isPrivate) {
      line("Private account: posts and engagement are hidden.", 9, regular, MUTED, 4);
    }

    if (profile.audience) {
      line(
        `Top audience: ${profile.audience.topCountries
          .slice(0, 2)
          .map((slice) => `${slice.label} ${slice.percentage}%`)
          .join(" | ")}`,
        9,
        regular,
        MUTED,
        4,
      );
      line(
        `Age: ${profile.audience.ageGroups
          .slice(0, 2)
          .map((slice) => `${slice.label} ${slice.percentage}%`)
          .join(" | ")} | Gender: ${profile.audience.gender
          .slice(0, 2)
          .map((slice) => `${slice.label} ${slice.percentage}%`)
          .join(" | ")}`,
        9,
        regular,
        MUTED,
        12,
      );
    } else {
      line(
        "Audience demographics: not exposed for public accounts.",
        9,
        regular,
        MUTED,
        12,
      );
    }

    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.5,
      color: RULE,
    });
    y -= 14;
  }

  ensureSpace(34);
  page.drawText(
    hasLive || hasPublic
      ? "Includes public Instagram data. Saves, reach, audience, and measured follower history may be unavailable."
      : "Demo dataset. No live Instagram data was used.",
    {
      x: MARGIN,
      y: MARGIN - 12,
      size: 8,
      font: regular,
      color: MUTED,
    },
  );

  if (hasEstimates) {
    page.drawText(
      toAscii(
        "Fake followers, authenticity, and 12-month growth are modeled estimates where measured data is unavailable.",
        "",
      ),
      {
        x: MARGIN,
        y: MARGIN - 26,
        size: 8,
        font: regular,
        color: MUTED,
      },
    );
  }

  const bytes = await pdf.save();
  const filename = `ig-analysis-${profiles.map((profile) => profile.username).join("-")}.pdf`;

  return { bytes, filename };
}
