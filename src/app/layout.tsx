import type { Metadata } from "next";
import Link from "next/link";
import { Activity, BarChart3, GitCompareArrows } from "lucide-react";
import { isLiveConfigured } from "../core/data/adapter";
import "./globals.css";

export const metadata: Metadata = {
  title: "Instagram Analytics — Profile Analytics",
  description: "Professional Instagram profile analysis, comparison, and PDF reporting.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const liveConfigured = isLiveConfigured();

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <div className="flex min-h-screen">
          <aside className="hidden w-60 shrink-0 flex-col bg-slate-950 px-5 py-7 text-slate-300 lg:flex">
            <Link href="/" className="flex items-center gap-2 text-base font-bold leading-none tracking-tight text-white">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500">
                <Activity className="h-4 w-4 text-white" aria-hidden="true" />
              </span>
              <span className="leading-tight">
                Instagram
                <br />
                Analytics
              </span>
            </Link>

            <nav className="mt-10 space-y-1 text-sm">
              <Link
                href="/"
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                <BarChart3 className="h-4 w-4" aria-hidden="true" />
                Discover
              </Link>
              <Link
                href="/compare"
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                <GitCompareArrows className="h-4 w-4" aria-hidden="true" />
                Compare
              </Link>
            </nav>

            <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-4 text-xs leading-relaxed text-slate-400">
              {liveConfigured ? "Public web + official API" : "Public web workspace"}
              <br />
              Username-only lookup
              <br />
              {liveConfigured ? "Fallback enabled" : "No API keys required"}
            </div>
          </aside>

          <main className="min-w-0 flex-1">
            <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
              <div className="flex items-center gap-2 lg:hidden">
                <Link href="/" className="font-bold tracking-tight text-slate-950">
                  Instagram Analytics
                </Link>
              </div>
              <p className="hidden text-sm font-medium text-slate-500 lg:block">
                Instagram intelligence workspace
              </p>
              <span
                className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
              >
                {liveConfigured ? "Public + API" : "Public web"}
              </span>
            </header>

            <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
