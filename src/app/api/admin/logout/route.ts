import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, adminReturnPath } from "../../../../core/admin/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let next = "/admin/locations";
  try {
    next = adminReturnPath((await request.formData()).get("next"));
  } catch {
    // Keep the default admin destination when the body is not form data.
  }
  const response = NextResponse.redirect(new URL(next, request.url), 303);
  response.cookies.delete(ADMIN_COOKIE);
  return response;
}
