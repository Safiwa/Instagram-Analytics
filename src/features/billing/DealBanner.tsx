"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Deal } from "../../core/billing/deals";

type DealBannerProps = {
  deal: Deal;
};

function remaining(endsAt: string, now: number): string | null {
  const ms = Date.parse(endsAt) - now;
  if (ms <= 0) {
    return null;
  }
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  return days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

// Slim strip above the header while a deal runs. It decides on the visitor's
// clock after mount, so cached pages never show an expired deal, and it hides
// itself the moment the deal ends.
export function DealBanner({ deal }: DealBannerProps) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  if (now === null || now < Date.parse(deal.startsAt)) {
    return null;
  }
  const left = remaining(deal.endsAt, now);
  if (!left) {
    return null;
  }

  return (
    <div data-testid="deal-banner" className="bg-slate-950 text-white">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-xs sm:text-sm">
        <span className="font-semibold">
          🖤 {deal.label}: {deal.percentOff}% off yearly plans
        </span>
        <span className="text-slate-300">Pro for half the monthly price, for a whole year</span>
        <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[11px] tabular-nums">
          ends in {left}
        </span>
        <Link
          href="/pricing?interval=yearly"
          className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-950 transition hover:bg-slate-200"
        >
          See deal
        </Link>
      </div>
    </div>
  );
}
