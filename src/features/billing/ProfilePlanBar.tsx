import Link from "next/link";
import { CalendarClock, Check } from "lucide-react";

type ProfilePlanBarProps = {
  handle: string;
  signedIn: boolean;
  planName: string;
  historyDays: number | null;
  historyTrimmed: boolean;
  trackingAllowance: number;
  isTracked: boolean;
};

// Plan-aware strip above a profile: daily tracking for this handle and how much
// stored history the plan shows.
export function ProfilePlanBar({
  handle,
  signedIn,
  planName,
  historyDays,
  historyTrimmed,
  trackingAllowance,
  isTracked,
}: ProfilePlanBarProps) {
  const next = `/profile/${handle}`;
  return (
    <div
      data-testid="profile-plan-bar"
      className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex items-center gap-2 text-slate-600">
        <CalendarClock className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden="true" />
        {historyTrimmed && historyDays !== null ? (
          <span>
            Showing the last {historyDays} days of stored history on {planName}.{" "}
            <Link href="/pricing" className="font-semibold text-indigo-600 hover:text-indigo-500">
              Upgrade for more
            </Link>
          </span>
        ) : (
          <span>{planName} plan</span>
        )}
      </p>
      {isTracked ? (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Tracked daily
        </span>
      ) : !signedIn ? (
        <Link
          href={`/account?next=${encodeURIComponent(next)}`}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Sign in to track daily
        </Link>
      ) : trackingAllowance > 0 ? (
        <form action="/api/account/track" method="post">
          <input type="hidden" name="handle" value={handle} />
          <input type="hidden" name="next" value={next} />
          <button
            type="submit"
            className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700"
          >
            Track daily
          </button>
        </form>
      ) : (
        <Link
          href="/pricing"
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500"
        >
          Track daily on Starter
        </Link>
      )}
    </div>
  );
}
