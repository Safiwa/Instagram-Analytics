import { NextResponse, type NextRequest } from "next/server";
import { addTrackedHandle, removeTrackedHandle } from "../../../../core/billing/accounts";
import { safeNext } from "../../../../core/billing/redirect";
import { getViewer } from "../../../../core/billing/viewer";
import { markTracked } from "../../../../core/db/snapshots";
import { log } from "../../../../core/logging/logger";

export const runtime = "nodejs";

const HANDLE = /^[a-z0-9._]{1,30}$/;

// Adds or removes a handle from the signed-in account's daily-tracking list.
// Tracked handles join the daily collector (one snapshot per day).
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const next = safeNext(form?.get("next"));
  const handle = String(form?.get("handle") ?? "").trim().replace(/^@/, "").toLowerCase();
  const action = form?.get("action") === "remove" ? "remove" : "add";
  const go = (query: string) => {
    const url = new URL(next, request.url);
    if (query) url.searchParams.set("track", query);
    return NextResponse.redirect(url, 303);
  };

  const viewer = await getViewer();
  if (!viewer.billingEnabled || !viewer.user) {
    return NextResponse.redirect(new URL(`/account?next=${encodeURIComponent(next)}`, request.url), 303);
  }
  if (!HANDLE.test(handle)) {
    return go("invalid");
  }

  try {
    if (action === "remove") {
      await removeTrackedHandle(viewer.user.id, handle);
      return go("removed");
    }
    const limit = viewer.plan.limits.trackedAccounts;
    if (limit === 0 || !(await addTrackedHandle(viewer.user.id, handle, limit))) {
      return go("limit");
    }
    await markTracked([handle]);
    return go("added");
  } catch (error) {
    log.error("track handle failed", { message: error instanceof Error ? error.message : "unknown" });
    return go("error");
  }
}
