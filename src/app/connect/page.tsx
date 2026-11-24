import Link from "next/link";
import { cookies } from "next/headers";
import { BadgeCheck, Lock, ShieldCheck } from "lucide-react";
import { getConnectedAccount } from "../../core/db/connected";
import { formatDate } from "../../core/format";
import { isConnectAvailable, SESSION_COOKIE, sessionAccountId } from "../../core/instagram/session";

export const dynamic = "force-dynamic";

type ConnectPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const MESSAGES: Record<string, { tone: "ok" | "warn"; text: string }> = {
  connected: { tone: "ok", text: "Your account is connected. Your insights now appear on your profile page." },
  disconnected: {
    tone: "ok",
    text: "Your account was disconnected. Your stored token and shared insights were deleted.",
  },
  "not-enabled": { tone: "warn", text: "Creator connections are not enabled on this site yet." },
  denied: { tone: "warn", text: "Instagram did not grant access, so nothing was connected." },
  expired: { tone: "warn", text: "That sign-in link expired. Please start again." },
  "no-account": {
    tone: "warn",
    text: "No Instagram account was shared. Only Instagram professional accounts (Creator or Business) can connect: select your account in the login window and try again.",
  },
  failed: { tone: "warn", text: "Instagram could not complete the connection. Please try again in a few minutes." },
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ConnectPage({ searchParams }: ConnectPageProps) {
  const params = await searchParams;
  const messageKey = first(params.connected)
    ? "connected"
    : first(params.disconnected)
      ? "disconnected"
      : first(params.error);
  const message = messageKey ? MESSAGES[messageKey] : undefined;

  const available = isConnectAvailable();
  const accountId = sessionAccountId((await cookies()).get(SESSION_COOKIE)?.value);
  const account = available && accountId ? await getConnectedAccount(accountId) : null;

  return (
    <div data-testid="connect-page" className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">For creators</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
          Share your verified Instagram insights
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Public pages only show followers, likes and comments. When you connect your Creator or
          Business account, your profile page here also shows the numbers brands ask for: audience
          countries, age and gender, plus reach, views, saves and shares from Instagram Insights.
          They are labelled as verified because they come from Instagram itself, shared by you.
        </p>
      </div>

      {message ? (
        <div
          data-testid="connect-message"
          className={`rounded-xl border px-4 py-3 text-sm ${
            message.tone === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      {account ? (
        <section
          data-testid="connected-account"
          className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <BadgeCheck className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            <h2 className="text-base font-semibold text-slate-950">@{account.username} is connected</h2>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-slate-500">Connected</dt>
              <dd className="font-medium text-slate-900">{formatDate(account.connectedAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Last insights update</dt>
              <dd className="font-medium text-slate-900">
                {account.lastSyncedAt ? formatDate(account.lastSyncedAt) : "Pending"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Access</dt>
              <dd className="font-medium text-slate-900">
                {new Date(account.tokenExpiresAt).getUTCFullYear() >= 2100
                  ? "Active until you disconnect"
                  : `Until ${formatDate(account.tokenExpiresAt)}`}
              </dd>
            </div>
          </dl>
          {account.lastError ? (
            <p className="mt-3 text-xs text-amber-700">
              The last update did not finish: {account.lastError}. It retries automatically every day.
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href={`/profile/${encodeURIComponent(account.username)}`}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              View my profile page
            </Link>
            <form method="post" action="/api/instagram/disconnect">
              <button
                type="submit"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Disconnect and delete my insights
              </button>
            </form>
          </div>
        </section>
      ) : available ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <a
            data-testid="connect-button"
            href="/api/instagram/connect"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-fuchsia-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Connect with Instagram
          </a>
          <p className="mt-3 text-xs text-slate-500">
            You sign in with Instagram or Facebook on Meta&apos;s own page, then choose your business
            portfolio and the Instagram professional account to share. This site never sees your
            password.
          </p>
        </section>
      ) : (
        <section
          data-testid="connect-unavailable"
          className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600"
        >
          Creator connections are not enabled yet. Public analytics for any handle are still
          available from the <Link href="/" className="font-medium text-indigo-600">home page</Link>.
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-indigo-600" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-slate-950">What we read</h3>
          </div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>Your username, account type and follower count</li>
            <li>Follower demographics: countries, cities, age and gender</li>
            <li>28-day reach, views, accounts engaged, interactions, saves and shares</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-indigo-600" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-slate-950">What we never do</h3>
          </div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>Post, comment or change anything on your account</li>
            <li>
              Read or send direct messages. Meta requires every app using this login to request the
              messages permission; we never use it
            </li>
            <li>See your password</li>
            <li>Keep your data after you disconnect: it is deleted at once</li>
          </ul>
        </div>
      </section>
      <p className="text-xs text-slate-500">
        Details are in our <Link href="/privacy" className="font-medium text-indigo-600">privacy policy</Link>.
        You can also remove our access in Meta: Business settings → Integrations, or Instagram →
        Settings → Website permissions → Apps and websites.
      </p>
    </div>
  );
}
