import { PLANS, type BillingInterval, type PaidPlanId } from "./plans";

// Time-limited promotions. A deal is a Dodo Payments discount code that the
// site applies automatically at checkout while the deal runs; the same code
// must exist in Dodo (test and live mode) with the same percentage, limited to
// the yearly products, for one billing cycle, expiring at endsAt. To move or
// rerun a deal, change the dates here and the code's expiry in Dodo.

export type Deal = {
  id: string;
  code: string;
  percentOff: number;
  interval: BillingInterval;
  // ISO timestamps (UTC). Dubai is UTC+4.
  startsAt: string;
  endsAt: string;
  // The trial is skipped: deal buyers pay the discounted year today.
  trial: false;
  label: string;
};

export const BLACK_FRIDAY_2026: Deal = {
  id: "black-friday-2026",
  code: "BLACKFRIDAY40",
  percentOff: 40,
  interval: "yearly",
  // 27 Nov 2026 00:00 to 1 Dec 2026 23:59:59, Dubai time.
  startsAt: "2026-11-26T20:00:00.000Z",
  endsAt: "2026-12-01T19:59:59.000Z",
  trial: false,
  label: "Black Friday",
};

export const DEALS: readonly Deal[] = [BLACK_FRIDAY_2026];

export function isDealActive(deal: Deal, now = new Date()): boolean {
  const time = now.getTime();
  return time >= Date.parse(deal.startsAt) && time <= Date.parse(deal.endsAt);
}

export function activeDeal(now = new Date()): Deal | null {
  return DEALS.find((deal) => isDealActive(deal, now)) ?? null;
}

// Whole-dollar deal price for the deal's interval: Pro yearly $290 -> $174.
export function dealPrice(deal: Deal, plan: PaidPlanId): number {
  const base = deal.interval === "yearly" ? PLANS[plan].yearlyUsd : PLANS[plan].monthlyUsd;
  return Math.round(base * (1 - deal.percentOff / 100));
}

export function dealAppliesTo(deal: Deal | null, interval: BillingInterval): deal is Deal {
  return deal !== null && deal.interval === interval;
}
