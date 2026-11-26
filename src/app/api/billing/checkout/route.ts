import { NextResponse, type NextRequest } from "next/server";
import { hasHadSubscription } from "../../../../core/billing/accounts";
import { billingConfig, createCheckout, isBillingEnabled, productFor } from "../../../../core/billing/dodo";
import { isPaidPlanId, PLANS } from "../../../../core/billing/plans";
import { getViewer } from "../../../../core/billing/viewer";
import { log } from "../../../../core/logging/logger";

export const runtime = "nodejs";

// Sends a signed-in visitor to Dodo Payments' hosted checkout for one plan.
// The account id travels as metadata and comes back on every webhook.
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
  const productId = productFor(config, plan, interval);
  if (!productId) {
    return pricing("error=unavailable");
  }

  try {
    // The free trial is only for an account's first subscription.
    const trialDays = PLANS[plan].trialDays > 0 && !(await hasHadSubscription(viewer.user.id)) ? PLANS[plan].trialDays : 0;
    const url = await createCheckout(config, {
      productId,
      email: viewer.user.email,
      userId: viewer.user.id,
      returnUrl: new URL("/account?checkout=success", request.url).toString(),
      trialDays,
    });
    return NextResponse.redirect(url, 303);
  } catch (error) {
    log.error("checkout creation failed", { message: error instanceof Error ? error.message : "unknown" });
    return pricing("error=checkout");
  }
}
