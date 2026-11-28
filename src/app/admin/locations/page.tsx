import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdminConfigured, isAdminSession } from "../../../core/admin/auth";
import { recordableCountries } from "../../../core/analytics/country";
import { listAccountLocations } from "../../../core/db/accountLocations";
import { isDatabaseConfigured } from "../../../core/db/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account locations · Admin",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const ERRORS: Record<string, string> = {
  unavailable: "Admin is not enabled. Set ADMIN_PASSWORD (12+ characters) in Vercel and redeploy.",
  password: "That password is not correct.",
  session: "Your admin session expired. Please sign in again.",
  handle: "Enter a valid Instagram username.",
  country: "Choose a country from the list.",
  save: "The change could not be saved. Please try again.",
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dubai",
  });
}

const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none";
const button =
  "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700";

export default async function AdminLocationsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const error = ERRORS[first(params.error) ?? ""];
  const saved = first(params.saved);
  const removed = first(params.removed);
  const signedIn = isAdminSession((await cookies()).get(ADMIN_COOKIE)?.value);

  return (
    <div data-testid="admin-locations" className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Admin</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
          Account based in
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Instagram shows an account&apos;s country only in its &ldquo;About this account&rdquo; sheet,
          to logged-in viewers, so the site cannot read it. Record it here and it overrides every
          inferred country signal on profile pages, rankings and boards within about 10 minutes.
        </p>
        <Link
          href="/admin/profiles"
          className="mt-3 inline-block text-xs font-medium text-indigo-700 hover:underline"
        >
          View Instagram Connect profiles by country
        </Link>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      ) : null}
      {saved ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Saved @{saved}.
        </div>
      ) : null}
      {removed ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Removed @{removed}. Its country is inferred again.
        </div>
      ) : null}

      {!isAdminConfigured() || !isDatabaseConfigured() ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          {ERRORS.unavailable}
        </p>
      ) : !signedIn ? (
        <form
          method="post"
          action="/api/admin/login"
          className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <input type="hidden" name="next" value="/admin/locations" />
          <label className="block text-sm font-medium text-slate-900" htmlFor="password">
            Admin password
          </label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className={input} />
          <button type="submit" className={button}>
            Sign in
          </button>
        </form>
      ) : (
        <SignedIn />
      )}
    </div>
  );
}

async function SignedIn() {
  const [entries, countries] = await Promise.all([listAccountLocations(), Promise.resolve(recordableCountries())]);
  return (
    <>
      <form
        method="post"
        action="/api/admin/locations"
        className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      >
        <div>
          <label className="block text-xs font-medium text-slate-600" htmlFor="username">
            Instagram username
          </label>
          <input id="username" name="username" placeholder="@najet.dh" required className={input} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600" htmlFor="country">
            Account based in
          </label>
          <select id="country" name="country" required className={input} defaultValue="">
            <option value="" disabled>
              Choose a country
            </option>
            <option value="none">Not published / unknown</option>
            {countries.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
        </div>
        <input type="hidden" name="action" value="save" />
        <button type="submit" className={button}>
          Save
        </button>
      </form>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-950">Recorded accounts ({entries.length})</h2>
        {entries.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nothing recorded yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {entries.map((entry) => (
              <li key={entry.username} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  <a className="font-medium text-indigo-700 hover:underline" href={`/profile/${entry.username}`}>
                    @{entry.username}
                  </a>{" "}
                  · {entry.country ?? "Not published"}{" "}
                  <span className="text-xs text-slate-400">· {formatDate(entry.recordedAt)}</span>
                </span>
                <form method="post" action="/api/admin/locations">
                  <input type="hidden" name="username" value={entry.username} />
                  <input type="hidden" name="action" value="delete" />
                  <button type="submit" className="text-xs font-medium text-slate-500 hover:text-red-600">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form method="post" action="/api/admin/logout">
        <input type="hidden" name="next" value="/admin/locations" />
        <button type="submit" className="text-xs font-medium text-slate-500 hover:text-slate-900">
          Sign out
        </button>
      </form>
    </>
  );
}
