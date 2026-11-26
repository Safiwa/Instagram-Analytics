import { NextResponse, type NextRequest } from "next/server";
import { billingConfig, createPortalLink } from "../../../../core/billing/dodo";
import { getViewer } from "../../../../core/billing/viewer";
import { log } from "../../../../core/logging/logger";

export const runtime = "nodejs";

// Dodo Payments customer portal: change plan, update card, cancel, invoices.
// A fresh, short-lived portal link is created on every click.
export async function GET(request: NextRequest) {
  const account = new URL("/account", request.url);
  const config = billingConfig();
  const viewer = await getViewer();
  const customerId = viewer.subscriptions.find((subscription) => subscription.customerId)?.customerId;
  if (!config || !viewer.user || !customerId) {
    return NextResponse.redirect(account, 303);
  }
  try {
    return NextResponse.redirect(await createPortalLink(config, customerId, account.toString()), 303);
  } catch (error) {
    log.error("customer portal link failed", { message: error instanceof Error ? error.message : "unknown" });
    return NextResponse.redirect(new URL("/account?error=portal", request.url), 303);
  }
}
