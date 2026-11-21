"use client";

import { useState, type FormEvent } from "react";
import { CircleAlert, CircleCheck, Mail } from "lucide-react";

type Status = "idle" | "loading" | "success" | "error";

export function WeeklyDigestSignup() {
  const [email, setEmail] = useState("");
  const [handle, setHandle] = useState("");
  const [consent, setConsent] = useState(false);
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const response = await fetch("/api/digest/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          handle,
          consent,
          company,
        }),
      });
      const payload = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        setStatus("error");
        setMessage(payload.error ?? "Could not save your subscription. Please try again.");
        return;
      }

      setStatus("success");
      setMessage(payload.message ?? "You're on the list.");
      setEmail("");
      setHandle("");
      setConsent(false);
    } catch {
      setStatus("error");
      setMessage("Could not reach the server. Please try again.");
    }
  };

  return (
    <section
      data-testid="weekly-digest"
      className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-6 shadow-sm"
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_1.05fr] lg:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
            <Mail className="h-3 w-3" aria-hidden="true" />
            Free 30-day trial
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
            Prove Instagram performance with real data
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
            Need to back up your numbers? Start a FREE 30-day trial and use Instagram analytics to
            benchmark, compare, and report with confidence. Add your email and a public handle, and
            we&apos;ll send a weekly digest of your profile&apos;s performance every Monday.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            <li className="flex items-center gap-2">
              <CircleCheck className="h-4 w-4 text-indigo-600" aria-hidden="true" />
              Weekly digest emails with engagement and follower changes
            </li>
            <li className="flex items-center gap-2">
              <CircleCheck className="h-4 w-4 text-indigo-600" aria-hidden="true" />
              Benchmark public profiles and compare before you report
            </li>
            <li className="flex items-center gap-2">
              <CircleCheck className="h-4 w-4 text-indigo-600" aria-hidden="true" />
              No card required. Free for 30 days
            </li>
          </ul>
        </div>

        <form
          onSubmit={submit}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div aria-hidden="true" className="absolute -left-[9999px]">
            <label htmlFor="digest-company">Company</label>
            <input
              id="digest-company"
              name="company"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          <label htmlFor="digest-email" className="block text-xs font-medium text-slate-700">
            Email address
          </label>
          <input
            id="digest-email"
            name="email"
            type="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />

          <label htmlFor="digest-handle" className="mt-4 block text-xs font-medium text-slate-700">
            Instagram username
          </label>
          <div className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 transition focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
            <span className="text-sm text-slate-400" aria-hidden="true">
              @
            </span>
            <input
              id="digest-handle"
              name="handle"
              required
              pattern="[a-z0-9._]{1,30}"
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              placeholder="username"
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400"
            />
          </div>

          <label className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-slate-600">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
            />
            <span>I agree to receive the weekly digest by email.</span>
          </label>

          <button
            type="submit"
            disabled={status === "loading"}
            className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "loading" ? "Joining..." : "Start free trial"}
          </button>

          <p
            aria-live="polite"
            className={`mt-3 flex items-start gap-2 text-xs leading-relaxed ${
              status === "error" ? "text-rose-700" : "text-emerald-700"
            }`}
          >
            {status === "error" ? (
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : null}
            {status === "success" ? (
              <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : null}
            {message}
          </p>
        </form>
      </div>
    </section>
  );
}
