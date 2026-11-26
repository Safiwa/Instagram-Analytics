import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { activeDeal, dealAppliesTo, dealPrice, type Deal } from "../../core/billing/deals";
import { billingConfig, isBillingEnabled, productFor } from "../../core/billing/dodo";
import { PAID_PLAN_IDS, PLANS, TRIAL_DAYS, type BillingInterval, type Plan } from "../../core/billing/plans";
import { getViewer } from "../../core/billing/viewer";

export const metadata: Metadata = {
  title: "Pricing — Instagram Analytics",
  description: `Free lookups, plus Starter, Pro and Agency plans. Pro comes with a ${TRIAL_DAYS}-day free trial.`,
};

type PricingPageProps = {
  searchParams: Promise<{ interval?: string; error?: string; feature?: string }>;
};

const ERRORS: Record<string, string> = {
  unavailable: "That plan is not available for checkout yet. Please try again later.",
  checkout: "The checkout could not be opened. Please try again in a moment.",
};

function price(
  plan: Plan,
  interval: BillingInterval,
  deal: Deal | null,
): { amount: string; note: string; was?: string } {
  if (plan.monthlyUsd === 0) {
    return { amount: "$0", note: "forever" };
  }
  if (plan.id !== "free" && dealAppliesTo(deal, interval)) {
    const amount = dealPrice(deal, plan.id);
    return {
      amount: `$${amount}`,
      was: `$${plan.yearlyUsd}`,
      note: `first year · $${(amount / 12).toFixed(2)}/mo`,
    };
  }
  return interval === "yearly"
    ? { amount: `$${plan.yearlyUsd}`, note: "per year (2 months free)" }
    : { amount: `$${plan.monthlyUsd}`, note: "per month" };
}

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const { interval: rawInterval, error, feature } = await searchParams;
  const [viewer, config] = [await getViewer(), billingConfig()];
  const enabled = isBillingEnabled();
  // Deals only show once plans can actually be bought.
  const deal = enabled ? activeDeal() : null;
  // During a yearly deal the page opens on yearly.
  const interval: BillingInterval =
    rawInterval === "yearly" || rawInterval === "monthly"
      ? rawInterval
      : deal?.interval ?? "monthly";
  const current = viewer.billingEnabled ? viewer.plan.id : null;

  return (
    <div className="space-y-8">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Pricing</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
          Plans for creators, brands and agencies
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-500">
          Start free. Try Pro free for {TRIAL_DAYS} days, then pay monthly or yearly. Cancel any time from
          your account.
        </p>
        <div
          role="group"
          aria-label="Billing period"
          className="mt-5 inline-flex rounded-xl border border-slate-200 bg-white p-1 text-sm"
        >
          {(["monthly", "yearly"] as const).map((option) => (
            <Link
              key={option}
              href={`/pricing?interval=${option}`}
              aria-current={interval === option ? "true" : undefined}
              className={`rounded-lg px-4 py-1.5 font-medium transition ${
                interval === option ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {option === "monthly"
                ? "Monthly"
                : deal?.interval === "yearly"
                  ? `Yearly · ${deal.percentOff}% off`
                  : "Yearly · 2 months free"}
            </Link>
          ))}
        </div>
      </div>

      {error && ERRORS[error] ? (
        <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-center text-sm text-rose-700">
          {ERRORS[error]}
        </p>
      ) : null}
      {deal ? (
        <div
          data-testid="pricing-deal"
          className="rounded-2xl bg-slate-950 px-5 py-4 text-center text-white"
        >
          <p className="text-sm font-semibold">
            🖤 {deal.label}: {deal.percentOff}% off your first year on every yearly plan
          </p>
          <p className="mt-1 text-xs text-slate-300">
            Pro for ${dealPrice(deal, "pro")} a year instead of ${PLANS.pro.yearlyUsd}, which is half the
            monthly price. Ends{" "}
            {new Intl.DateTimeFormat("en-GB", {
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
              timeZone: "Asia/Dubai",
              timeZoneName: "short",
            }).format(new Date(deal.endsAt))}
            . Renews at the normal yearly price.
          </p>
        </div>
      ) : null}
      {feature === "report" ? (
        <p role="status" className="rounded-xl bg-indigo-50 px-4 py-3 text-center text-sm text-indigo-800">
          PDF reports are included in Pro and Agency. Try Pro free for {TRIAL_DAYS} days.
        </p>
      ) : null}
      {!enabled ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-center text-sm text-amber-800">
          Paid plans are launching soon. Everything on the site is free until then.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[PLANS.free, ...PAID_PLAN_IDS.map((id) => PLANS[id])].map((plan) => {
          const { amount, note, was } = price(plan, interval, deal);
          const onDeal = plan.id !== "free" && dealAppliesTo(deal, interval);
          const isCurrent = current === plan.id;
          const purchasable =
            enabled && plan.id !== "free" && config !== null && productFor(config, plan.id, interval) !== null;
          return (
            <section
              key={plan.id}
              data-testid={`plan-${plan.id}`}
              className={`flex flex-col rounded-2xl border bg-white p-6 shadow-sm ${
                plan.highlighted ? "border-indigo-500 ring-2 ring-indigo-500" : "border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-950">{plan.name}</h2>
                {onDeal ? (
                  <span className="rounded-full bg-slate-950 px-2 py-0.5 text-[11px] font-semibold text-white">
                    {deal?.label} −{deal?.percentOff}%
                  </span>
                ) : plan.highlighted ? (
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                    {TRIAL_DAYS}-day free trial
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-slate-500">{plan.tagline}</p>
              <p className="mt-4">
                {was ? (
                  <span className="mr-2 text-lg font-medium text-slate-400 line-through">{was}</span>
                ) : null}
                <span className="text-3xl font-semibold tracking-tight text-slate-950">{amount}</span>{" "}
                <span className="text-sm text-slate-500">{note}</span>
              </p>
              <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-700">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                {isCurrent ? (
                  <p className="rounded-lg bg-slate-100 px-4 py-2 text-center text-sm font-semibold text-slate-600">
                    Your current plan
                  </p>
                ) : plan.id === "free" ? (
                  <Link
                    href="/"
                    className="block rounded-lg border border-slate-300 px-4 py-2 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Start searching
                  </Link>
                ) : purchasable ? (
                  <form action="/api/billing/checkout" method="post">
                    <input type="hidden" name="plan" value={plan.id} />
                    <input type="hidden" name="interval" value={interval} />
                    <button
                      type="submit"
                      className={`w-full rounded-lg px-4 py-2 text-sm font-semibold transition ${
                        plan.highlighted
                          ? "bg-indigo-600 text-white hover:bg-indigo-500"
                          : "bg-slate-950 text-white hover:bg-slate-700"
                      }`}
                    >
                      {onDeal
                        ? `Get ${plan.name} for ${amount}`
                        : plan.trialDays > 0
                          ? `Start ${plan.trialDays}-day free trial`
                          : `Choose ${plan.name}`}
                    </button>
                  </form>
                ) : (
                  <p className="rounded-lg bg-slate-100 px-4 py-2 text-center text-sm font-medium text-slate-500">
                    Coming soon
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        <h2 className="text-base font-semibold text-slate-950">Good to know</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>
            A lookup is one profile opened. Opening the same profile again in the same day (Free) or month (paid
            plans) does not count twice.
          </li>
          <li>
            The {TRIAL_DAYS}-day trial is on Pro, for your first subscription. Your card is charged when the trial
            ends unless you cancel before then.
          </li>
          {deal ? (
            <li>
              {deal.label} prices apply to the first year of yearly plans bought before the deal ends, then renew at
              the normal yearly price. The free trial does not apply to deal purchases.
            </li>
          ) : null}
          <li>Payments are handled securely by Dodo Payments, our reseller, which also handles VAT and sales tax.</li>
          <li>Prices are in US dollars; checkout shows the amount in your local currency.</li>
        </ul>
      </div>
    </div>
  );
}
