import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdminConfigured, isAdminSession } from "../../../core/admin/auth";
import { isDatabaseConfigured } from "../../../core/db/client";
import { listConnectedProfilesForAdmin, type ConnectedProfileForAdmin } from "../../../core/db/connected";
import { formatDate } from "../../../core/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connected profiles · Admin",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const ERRORS: Record<string, string> = {
  unavailable: "Admin is not enabled. Set ADMIN_PASSWORD (12+ characters) in Vercel and redeploy.",
  password: "That password is not correct.",
  session: "Your admin session expired. Please sign in again.",
};

const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none";
const button =
  "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function countryLabel(profile: ConnectedProfileForAdmin): string {
  return (
    profile.country ??
    (profile.countryStatus === "not-published" ? "Not published" : "Not recorded")
  );
}

export default async function AdminProfilesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const error = ERRORS[first(params.error) ?? ""];
  const signedIn = isAdminSession((await cookies()).get(ADMIN_COOKIE)?.value);

  return (
    <div data-testid="admin-profiles" className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Admin</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
          Instagram Connect profiles
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Every account that opted in through Instagram Connect. Countries are the manually recorded
          &ldquo;Account based in&rdquo; values from{" "}
          <Link href="/admin/locations" className="font-medium text-indigo-700 hover:underline">
            Account locations
          </Link>
          . Audience demographics are not treated as the account&apos;s country.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
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
          <input type="hidden" name="next" value="/admin/profiles" />
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
  const summary = await listConnectedProfilesForAdmin();

  return (
    <>
      <section
        data-testid="connected-country-counts"
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-base font-semibold text-slate-950">Profiles by country</h2>
          <p className="text-sm text-slate-500">
            Total opted in: <span className="font-semibold text-slate-900">{summary.total}</span>
          </p>
        </div>
        {summary.countries.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No accounts have opted in yet.</p>
        ) : (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {summary.countries.map((entry) => (
              <li
                key={entry.country}
                data-testid="country-count"
                className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <span className="text-slate-700">{entry.country}</span>
                <span className="font-semibold text-slate-950">{entry.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        data-testid="connected-profiles"
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-950">
            Opted-in profiles ({summary.total})
          </h2>
        </div>
        {summary.profiles.length === 0 ? (
          <p className="px-6 py-5 text-sm text-slate-500">No accounts have opted in yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-6 py-3 font-medium">Instagram account</th>
                  <th scope="col" className="px-6 py-3 font-medium">Account based in</th>
                  <th scope="col" className="px-6 py-3 font-medium">Connected</th>
                  <th scope="col" className="px-6 py-3 font-medium">Last insights update</th>
                  <th scope="col" className="px-6 py-3 font-medium">Profile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.profiles.map((profile) => (
                  <tr key={profile.id}>
                    <td className="px-6 py-3 font-medium text-slate-950">@{profile.username}</td>
                    <td className="px-6 py-3 text-slate-700">{countryLabel(profile)}</td>
                    <td className="px-6 py-3 text-slate-700">
                      {profile.connectedAt ? formatDate(profile.connectedAt) : "—"}
                    </td>
                    <td className="px-6 py-3 text-slate-700">
                      {profile.lastSyncedAt ? formatDate(profile.lastSyncedAt) : "Pending"}
                    </td>
                    <td className="px-6 py-3">
                      <Link
                        href={`/profile/${encodeURIComponent(profile.username)}`}
                        className="font-medium text-indigo-700 hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <Link href="/admin/locations" className="text-xs font-medium text-indigo-700 hover:underline">
          Manage account locations
        </Link>
        <form method="post" action="/api/admin/logout">
          <input type="hidden" name="next" value="/admin/profiles" />
          <button type="submit" className="text-xs font-medium text-slate-500 hover:text-slate-900">
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}
