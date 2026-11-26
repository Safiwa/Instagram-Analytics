import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "../../../../core/billing/viewer";

// Lemon Squeezy's customer portal: change plan, update card, cancel, invoices.
export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  const portal = viewer.subscriptions.find((subscription) => subscription.customerPortalUrl)?.customerPortalUrl;
  if (!viewer.user || !portal || !portal.startsWith("https://")) {
    return NextResponse.redirect(new URL("/account", request.url), 303);
  }
  return NextResponse.redirect(portal, 303);
}
