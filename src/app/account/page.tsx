import type { Metadata } from "next";
import Link from "next/link";
import { countLookups, listTrackedHandles } from "../../core/billing/accounts";
import { safeNext } from "../../core/billing/redirect";
import { usagePeriod } from "../../core/billing/plans";
import { getViewer } from "../../core/billing/viewer";
import { formatCompact } from "../../core/format";

export const metadata: Metadata = {
  title: "Account — Instagram Analytics",
  robots: { index: false },
};

type AccountPageProps = {
  searchParams: Promise<{
    sent?: string;
    error?: string;
    next?: string;
    checkout?: string;
    track?: string;
    reason?: string;
  }>;
};

const ERRORS: Record<string, string> = {
  email: "Enter a valid email address.",
  send: "The sign-in email could not be sent. Please try again in a moment.",
  link: "That sign-in link has expired or is invalid. Request a new one below.",
  "not-enabled": "Accounts are not switched on yet.",
  portal: "The billing portal could not be opened. Please try again in a moment.",
};

const TRACK_MESSAGES: Record<string, string> = {
  added: "Added. The account is now snapshotted every day.",
  removed: "Removed from daily tracking.",
  limit: "Your plan's tracking allowance is used up. Remove one or upgrade.",
  invalid: "That is not a valid Instagram username.",
  error: "Something went wrong. Please try again.",
};

function formatDate(value: string | null): string | null {
  return value
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value))
    : null;
}

const STATUS_LABELS: Record<string, string> = {
  on_trial: "Free trial",
  active: "Active",
  past_due: "Payment due",
  on_hold: "On hold (payment failed)",
  pending: "Pending",
  cancelled: "Cancelled",
  paused: "Paused",
  failed: "Payment failed",
  expired: "Expired",
};

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const viewer = await getViewer();

  if (!viewer.billingEnabled) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-950">Accounts are coming soon</h1>
        <p className="mt-2 text-sm text-slate-500">Everything on the site is free to use until paid plans launch.</p>
        <Link href="/pricing" className="mt-5 inline-flex text-sm font-semibold text-indigo-600 hover:text-indigo-500">
          See the planned pricing
        </Link>
      </div>
    );
  }

  if (!viewer.user) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-950">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">
            {params.reason === "checkout"
              ? "Sign in first so your plan is linked to your account."
              : "We email you a sign-in link. No password needed."}
          </p>
          {params.sent ? (
            <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Check your inbox for the sign-in link. It works for 15 minutes.
            </p>
          ) : null}
          {params.error && ERRORS[params.error] ? (
            <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {ERRORS[params.error]}
            </p>
          ) : null}
          <form action="/api/account/login" method="post" className="mt-5 space-y-3">
            <input type="hidden" name="next" value={next} />
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Email me a sign-in link
            </button>
          </form>
        </div>
      </div>
    );
  }

  const { plan, user, subscriptions } = viewer;
  const period = usagePeriod(plan.limits);
  const [used, tracked] = await Promise.all([
    viewer.subject ? countLookups(viewer.subject, period).catch(() => 0) : Promise.resolve(0),
    listTrackedHandles(user.id).catch(() => [] as string[]),
  ]);
  const subscription = subscriptions[0] ?? null;
  const portal = subscriptions.some((item) => item.customerId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Account</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{user.email}</h1>
        </div>
        <form action="/api/account/logout" method="post">
          <button type="submit" className="text-sm font-medium text-slate-500 hover:text-slate-950">
            Sign out
          </button>
        </form>
      </div>

      {params.checkout === "success" ? (
        <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Thank you! Your plan is being activated. It can take a few seconds to appear; refresh if you still see
          Free.
        </p>
      ) : null}
      {params.error === "portal" ? (
        <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {ERRORS.portal}
        </p>
      ) : null}
      {params.track && TRACK_MESSAGES[params.track] ? (
        <p role="status" className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
          {TRACK_MESSAGES[params.track]}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Plan</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">{plan.name}</p>
          {subscription ? (
            <p className="mt-1 text-sm text-slate-500">
              {STATUS_LABELS[subscription.status] ?? subscription.status}
              {subscription.status === "on_trial" && subscription.trialEndsAt
                ? ` · ends ${formatDate(subscription.trialEndsAt)}`
                : subscription.endsAt
                  ? ` · access until ${formatDate(subscription.endsAt)}`
                  : subscription.renewsAt
                    ? ` · renews ${formatDate(subscription.renewsAt)}`
                    : ""}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/pricing"
              className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500"
            >
              {plan.id === "free" ? "Upgrade" : "Compare plans"}
            </Link>
            {portal ? (
              <a
                href="/api/billing/portal"
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Manage billing
              </a>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Lookups this {plan.limits.lookupPeriod}
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">
            {formatCompact(used)} <span className="text-base font-normal text-slate-400">/ {formatCompact(plan.limits.lookups)}</span>
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-indigo-500"
              style={{ width: `${Math.min(100, (used / plan.limits.lookups) * 100)}%` }}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Included</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            <li>Compare up to {plan.limits.compareMax} accounts</li>
            <li>{plan.limits.historyDays === null ? "Full" : `${plan.limits.historyDays} days of`} growth history</li>
            <li>PDF reports: {plan.limits.pdfReport ? "yes" : "no"}</li>
          </ul>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-950">Daily-tracked accounts</h2>
          <p className="text-sm text-slate-500">
            {tracked.length} of {plan.limits.trackedAccounts} used
          </p>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Tracked accounts get a snapshot every day, building their follower and engagement history.
        </p>
        {plan.limits.trackedAccounts > 0 ? (
          <form action="/api/account/track" method="post" className="mt-4 flex max-w-md gap-2">
            <input type="hidden" name="next" value="/account" />
            <label htmlFor="track-handle" className="sr-only">
              Instagram username
            </label>
            <input
              id="track-handle"
              name="handle"
              placeholder="username"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Track
            </button>
          </form>
        ) : (
          <p className="mt-4 text-sm text-slate-600">
            Daily tracking starts on the Starter plan.{" "}
            <Link href="/pricing" className="font-semibold text-indigo-600 hover:text-indigo-500">
              See plans
            </Link>
          </p>
        )}
        {tracked.length > 0 ? (
          <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {tracked.map((handle) => (
              <li key={handle} className="flex items-center justify-between px-4 py-2.5">
                <Link href={`/profile/${handle}`} className="text-sm font-medium text-slate-950 hover:text-indigo-600">
                  @{handle}
                </Link>
                <form action="/api/account/track" method="post">
                  <input type="hidden" name="next" value="/account" />
                  <input type="hidden" name="handle" value={handle} />
                  <input type="hidden" name="action" value="remove" />
                  <button type="submit" className="text-xs font-medium text-slate-500 hover:text-rose-600">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
