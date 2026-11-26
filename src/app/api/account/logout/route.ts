import { NextResponse, type NextRequest } from "next/server";
import { ACCOUNT_COOKIE } from "../../../../core/billing/viewer";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/account", request.url), 303);
  response.cookies.delete(ACCOUNT_COOKIE);
  return response;
}
