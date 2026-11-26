import Link from "next/link";
import { Lock } from "lucide-react";

type UpgradeNoticeProps = {
  title: string;
  description: string;
  signedIn: boolean;
  testId?: string;
};

// Shown wherever a plan limit hides something. Signed-out visitors are offered
// sign-in too, since a paid plan may already be on their account.
export function UpgradeNotice({ title, description, signedIn, testId = "upgrade-notice" }: UpgradeNoticeProps) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500 text-white">
          <Lock className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-950">{title}</p>
          <p className="mt-0.5 text-sm text-slate-600">{description}</p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        {signedIn ? null : (
          <Link
            href="/account"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Sign in
          </Link>
        )}
        <Link
          href="/pricing"
          className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500"
        >
          See plans
        </Link>
      </div>
    </div>
  );
}
