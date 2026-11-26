import { parseHandles, resolveProfile } from "../../../core/data/adapter";
import type { CreatorProfile } from "../../../core/data/types";
import { withStoredHistory } from "../../../core/db/enrich";
import { log } from "../../../core/logging/logger";
import { buildReport } from "../../../features/report/reportDocument";
import { getViewer } from "../../../core/billing/viewer";

export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  // PDF reports are a Pro and Agency feature once paid plans are switched on.
  const viewer = await getViewer();
  if (!viewer.plan.limits.pdfReport) {
    return Response.redirect(new URL("/pricing?feature=report", request.url), 303);
  }
  const parsed = parseHandles(url.searchParams.get("handles"));
  parsed.handles = parsed.handles.slice(0, viewer.plan.limits.compareMax);

  if (parsed.handles.length === 0) {
    log.warn("report request without handles");
    return Response.json({ error: "Provide at least one handle." }, { status: 400 });
  }

  const resolutions = await Promise.all(
    parsed.handles.map(async (handle) => {
      const resolution = await resolveProfile(handle);
      return resolution.status === "found"
        ? { ...resolution, profile: await withStoredHistory(resolution.profile) }
        : resolution;
    }),
  );
  const profiles: CreatorProfile[] = [];
  const missing: string[] = [];

  resolutions.forEach((resolution, index) => {
    if (resolution.status === "found") {
      profiles.push(resolution.profile);
    } else {
      missing.push(parsed.handles[index]);
    }
  });

  if (missing.length > 0) {
    log.warn("report request with unavailable handles", { missing: missing.join(",") });
    return Response.json(
      { error: `Unavailable handle(s): ${missing.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const report = await buildReport(profiles);
    const body = new Blob([new Uint8Array(report.bytes)], { type: "application/pdf" });
    log.info("report generated", { profiles: profiles.length });

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${report.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    log.error("report generation failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return Response.json({ error: "Report generation failed." }, { status: 500 });
  }
}
