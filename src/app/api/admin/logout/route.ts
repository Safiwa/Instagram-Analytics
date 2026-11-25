import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE } from "../../../../core/admin/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/admin/locations", request.url), 303);
  response.cookies.delete(ADMIN_COOKIE);
  return response;
}
