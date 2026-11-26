// Single source of truth for the paid plans: prices shown on /pricing and the
// limits every gate in the app reads. Prices are in US dollars; Dodo Payments
// shows local currency at checkout.

export type PlanId = "free" | "starter" | "pro" | "agency";
export type PaidPlanId = Exclude<PlanId, "free">;
export type BillingInterval = "monthly" | "yearly";

export type PlanLimits = {
  // Distinct profiles a subject may open per period (same handle again is free).
  lookups: number;
  // "day" for anonymous/free visitors, "month" for paid plans.
  lookupPeriod: "day" | "month";
  // Accounts side by side on /compare (the site's hard maximum is 4).
  compareMax: number;
  pdfReport: boolean;
  // Handles the account can add to the daily collector.
  trackedAccounts: number;
  // Days of stored daily history shown on a profile; null = everything stored.
  historyDays: number | null;
};

export type Plan = {
  id: PlanId;
  name: string;
  tagline: string;
  monthlyUsd: number;
  // Annual price = 10 months (2 months free).
  yearlyUsd: number;
  trialDays: number;
  highlighted: boolean;
  limits: PlanLimits;
  features: string[];
};

export const TRIAL_DAYS = 14;

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "For a quick look at any public account",
    monthlyUsd: 0,
    yearlyUsd: 0,
    trialDays: 0,
    highlighted: false,
    limits: {
      lookups: 3,
      lookupPeriod: "day",
      compareMax: 2,
      pdfReport: false,
      trackedAccounts: 0,
      historyDays: 7,
    },
    features: ["3 profile lookups a day", "Basic stats and engagement rate", "Compare 2 accounts", "7 days of growth history"],
  },
  starter: {
    id: "starter",
    name: "Starter",
    tagline: "For creators tracking their own growth",
    monthlyUsd: 9,
    yearlyUsd: 90,
    trialDays: 0,
    highlighted: false,
    limits: {
      lookups: 50,
      lookupPeriod: "month",
      compareMax: 2,
      pdfReport: false,
      trackedAccounts: 1,
      historyDays: 90,
    },
    features: ["50 profile lookups a month", "Track 1 account daily", "90 days of growth history", "Compare 2 accounts"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "For social media managers and small brands",
    monthlyUsd: 29,
    yearlyUsd: 290,
    trialDays: TRIAL_DAYS,
    highlighted: true,
    limits: {
      lookups: 300,
      lookupPeriod: "month",
      compareMax: 3,
      pdfReport: true,
      trackedAccounts: 10,
      historyDays: 365,
    },
    features: [
      "300 profile lookups a month",
      "Track 10 accounts daily",
      "12 months of growth history",
      "Compare 3 accounts side by side",
      "PDF reports",
    ],
  },
  agency: {
    id: "agency",
    name: "Agency",
    tagline: "For agencies vetting many influencers",
    monthlyUsd: 79,
    yearlyUsd: 790,
    trialDays: 0,
    highlighted: false,
    limits: {
      lookups: 1500,
      lookupPeriod: "month",
      compareMax: 4,
      pdfReport: true,
      trackedAccounts: 50,
      historyDays: null,
    },
    features: [
      "1,500 profile lookups a month",
      "Track 50 accounts daily",
      "Full growth history",
      "Compare 4 accounts side by side",
      "PDF reports",
    ],
  },
};

export const PAID_PLAN_IDS: PaidPlanId[] = ["starter", "pro", "agency"];
const RANK: Record<PlanId, number> = { free: 0, starter: 1, pro: 2, agency: 3 };

export function isPaidPlanId(value: unknown): value is PaidPlanId {
  return value === "starter" || value === "pro" || value === "agency";
}

export function higherPlan(a: PlanId, b: PlanId): PlanId {
  return RANK[a] >= RANK[b] ? a : b;
}

// Smallest plan that unlocks a feature, for "Upgrade to …" prompts.
export function cheapestPlanWith(test: (limits: PlanLimits) => boolean): PaidPlanId {
  return PAID_PLAN_IDS.find((id) => test(PLANS[id].limits)) ?? "agency";
}

// Subscription statuses that still grant access ("on_trial" is an active Dodo
// subscription inside its free trial; "past_due" is Dodo's retry grace period).
// A cancelled subscription keeps access until ends_at if that is still ahead.
const ACTIVE_STATUSES = new Set(["on_trial", "active", "past_due"]);

export type SubscriptionState = {
  plan: PaidPlanId;
  status: string;
  endsAt: string | null;
};

export function grantsAccess(subscription: SubscriptionState, now = new Date()): boolean {
  if (ACTIVE_STATUSES.has(subscription.status)) {
    return true;
  }
  if (subscription.status === "cancelled" && subscription.endsAt) {
    return new Date(subscription.endsAt).getTime() > now.getTime();
  }
  return false;
}

export function effectivePlan(subscriptions: readonly SubscriptionState[], now = new Date()): PlanId {
  return subscriptions
    .filter((subscription) => grantsAccess(subscription, now))
    .reduce<PlanId>((best, subscription) => higherPlan(best, subscription.plan), "free");
}

// "2026-11-26" for daily limits, "2026-11" for monthly ones (UTC).
export function usagePeriod(limits: PlanLimits, now = new Date()): string {
  const iso = now.toISOString();
  return limits.lookupPeriod === "day" ? iso.slice(0, 10) : iso.slice(0, 7);
}

// Keeps only the stored daily points inside the plan's history window.
export function trimHistory<T extends { date: string }>(
  points: readonly T[],
  historyDays: number | null,
  now = new Date(),
): T[] {
  if (historyDays === null) {
    return [...points];
  }
  const cutoff = new Date(now.getTime() - historyDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return points.filter((point) => point.date >= cutoff);
}
