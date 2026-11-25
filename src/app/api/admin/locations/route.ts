import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, isAdminSession, isSameOrigin } from "../../../../core/admin/auth";
import {
  deleteAccountLocation,
  isRecordableCountry,
  normalizeHandle,
  saveAccountLocation,
} from "../../../../core/db/accountLocations";
import { log } from "../../../../core/logging/logger";

export const runtime = "nodejs";

// Saves or removes one recorded "Account based in" value. The country "none"
// records that the account is not based where its bio suggests (unpublished).
export async function POST(request: NextRequest) {
  const back = (query: string) => NextResponse.redirect(new URL(`/admin/locations${query}`, request.url), 303);
  if (!isAdminSession(request.cookies.get(ADMIN_COOKIE)?.value) || !isSameOrigin(request)) {
    return back("?error=session");
  }
  const form = await request.formData();
  const username = normalizeHandle(String(form.get("username") ?? ""));
  if (!username) {
    return back("?error=handle");
  }
  try {
    if (form.get("action") === "delete") {
      await deleteAccountLocation(username);
      log.info("account location removed", { handle: username });
      return back(`?removed=${encodeURIComponent(username)}`);
    }
    const country = String(form.get("country") ?? "");
    if (country !== "none" && !isRecordableCountry(country)) {
      return back("?error=country");
    }
    await saveAccountLocation(username, country === "none" ? null : country);
    log.info("account location saved", { handle: username, country });
    return back(`?saved=${encodeURIComponent(username)}`);
  } catch (error) {
    log.warn("account location save failed", {
      handle: username,
      message: error instanceof Error ? error.message : "unknown",
    });
    return back("?error=save");
  }
}
