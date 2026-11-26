import { NextResponse, type NextRequest } from "next/server";
import { normalizeEmail, upsertUser } from "../../../../core/billing/accounts";
import { isBillingEnabled } from "../../../../core/billing/dodo";
import { safeNext } from "../../../../core/billing/redirect";
import {
  ACCOUNT_COOKIE,
  ACCOUNT_COOKIE_OPTIONS,
  ACCOUNT_TTL_SECONDS,
  accountCookieValue,
  emailFromLoginToken,
} from "../../../../core/billing/viewer";
import { log } from "../../../../core/logging/logger";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNext(params.get("next"));
  const email = normalizeEmail(emailFromLoginToken(params.get("token")));
  if (!isBillingEnabled() || !email) {
    return NextResponse.redirect(new URL("/account?error=link", request.url), 303);
  }

  try {
    const user = await upsertUser(email);
    const response = NextResponse.redirect(new URL(next, request.url), 303);
    response.cookies.set(ACCOUNT_COOKIE, accountCookieValue(user.id), {
      ...ACCOUNT_COOKIE_OPTIONS,
      maxAge: ACCOUNT_TTL_SECONDS,
    });
    log.info("account signed in", { status: "ok" });
    return response;
  } catch (error) {
    log.error("account sign-in failed", { message: error instanceof Error ? error.message : "unknown" });
    return NextResponse.redirect(new URL("/account?error=send", request.url), 303);
  }
}
