import { NextResponse, type NextRequest } from "next/server";
import { claimLoginEmailSlot, normalizeEmail } from "../../../../core/billing/accounts";
import { isBillingEnabled } from "../../../../core/billing/dodo";
import { safeNext } from "../../../../core/billing/redirect";
import { loginToken } from "../../../../core/billing/viewer";
import { sendEmail } from "../../../../core/digest/resend";
import { log } from "../../../../core/logging/logger";

export const runtime = "nodejs";

function back(request: NextRequest, query: string, next: string): NextResponse {
  const url = new URL("/account", request.url);
  url.search = `${query}&next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url, 303);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

// Passwordless sign-in: email a 15-minute signed link. The reply is the same
// whether or not the address has an account, so the form reveals nothing.
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const next = safeNext(form?.get("next"));
  if (!isBillingEnabled()) {
    return back(request, "error=not-enabled", next);
  }
  const email = normalizeEmail(form?.get("email"));
  if (!email) {
    return back(request, "error=email", next);
  }

  try {
    if (await claimLoginEmailSlot(email)) {
      const link = new URL("/api/account/verify", request.url);
      link.searchParams.set("token", loginToken(email));
      link.searchParams.set("next", next);
      const href = link.toString();
      await sendEmail(
        email,
        "Your Instagram Analytics sign-in link",
        `Sign in to Instagram Analytics:\n\n${href}\n\nThe link works for 15 minutes. If you did not ask for it, ignore this email.`,
        `<p>Sign in to Instagram Analytics:</p><p><a href="${escapeHtml(href)}">Sign in</a></p><p>The link works for 15 minutes. If you did not ask for it, ignore this email.</p>`,
        "sign-in email",
      );
    }
  } catch (error) {
    log.error("sign-in email failed", { message: error instanceof Error ? error.message : "unknown" });
    return back(request, "error=send", next);
  }
  return back(request, "sent=1", next);
}
