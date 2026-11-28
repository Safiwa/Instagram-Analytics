import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_COOKIE,
  ADMIN_COOKIE_OPTIONS,
  ADMIN_TTL_SECONDS,
  adminCookieValue,
  adminReturnPath,
  isAdminConfigured,
  isSameOrigin,
  passwordMatches,
} from "../../../../core/admin/auth";
import { log } from "../../../../core/logging/logger";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const unavailable = () =>
    NextResponse.redirect(new URL("/admin/locations?error=unavailable", request.url), 303);
  if (!isAdminConfigured() || !isSameOrigin(request)) {
    return unavailable();
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return unavailable();
  }
  const next = adminReturnPath(form.get("next"));
  const back = (query: string) => NextResponse.redirect(new URL(`${next}${query}`, request.url), 303);
  const password = String(form.get("password") ?? "");
  if (!passwordMatches(password)) {
    // A short fixed delay slows password guessing.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    log.warn("admin login rejected", {});
    return back("?error=password");
  }
  const response = back("");
  response.cookies.set(ADMIN_COOKIE, adminCookieValue(), {
    ...ADMIN_COOKIE_OPTIONS,
    maxAge: ADMIN_TTL_SECONDS,
  });
  return response;
}
