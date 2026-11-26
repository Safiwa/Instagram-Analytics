import { NextResponse, type NextRequest } from "next/server";
import { billingConfig, createCheckout, isBillingEnabled, variantFor } from "../../../../core/billing/lemonsqueezy";
import { isPaidPlanId } from "../../../../core/billing/plans";
import { getViewer } from "../../../../core/billing/viewer";
import { log } from "../../../../core/logging/logger";

export const runtime = "nodejs";

// Sends a signed-in visitor to Lemon Squeezy's hosted checkout for one plan.
// The account id travels as custom data and comes back on every webhook.
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const plan = form?.get("plan");
  const interval = form?.get("interval") === "yearly" ? "yearly" : "monthly";
  const pricing = (query: string) => NextResponse.redirect(new URL(`/pricing?${query}`, request.url), 303);

  const config = billingConfig();
  if (!config || !isBillingEnabled() || !isPaidPlanId(plan)) {
    return pricing("error=unavailable");
  }
  const viewer = await getViewer();
  if (!viewer.user) {
    return NextResponse.redirect(new URL("/account?next=/pricing&reason=checkout", request.url), 303);
  }
  const variantId = variantFor(config, plan, interval);
  if (!variantId) {
    return pricing("error=unavailable");
  }

  try {
    const url = await createCheckout(config, {
      variantId,
      email: viewer.user.email,
      userId: viewer.user.id,
      redirectUrl: new URL("/account?checkout=success", request.url).toString(),
    });
    return NextResponse.redirect(url, 303);
  } catch (error) {
    log.error("checkout creation failed", { message: error instanceof Error ? error.message : "unknown" });
    return pricing("error=checkout");
  }
}
