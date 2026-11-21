import Link from "next/link";
import {
  ChartNoAxesCombined,
  CircleAlert,
  CircleCheck,
  Database,
  FileDown,
  Gauge,
  GitCompareArrows,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { HandleLookup } from "../features/discovery/HandleLookup";
import { WeeklyDigestSignup } from "../features/digest/WeeklyDigestSignup";
import { BenchmarkPanel } from "../features/leaderboard/BenchmarkPanel";
import { GlobalPulse } from "../features/leaderboard/GlobalPulse";

// The live leaderboard is fetched per request and cached in the data layer.
export const dynamic = "force-dynamic";

type PipelineStep = {
  icon: LucideIcon;
  number: string;
  title: string;
  body: string;
};

type EngineCard = {
  icon: LucideIcon;
  label: string;
  kind: "Measured" | "Modeled";
  basis: string;
  body: string;
};

const PIPELINE: PipelineStep[] = [
  {
    icon: ScanSearch,
    number: "01",
    title: "Username in",
    body: "Enter any public handle. Instagram Analytics reads the account page and, only when configured, an official API source.",
  },
  {
    icon: Database,
    number: "02",
    title: "Public signals",
    body: "Profile counts, verification, bio, and up to 12 recent posts with likes, comments, and video views are parsed.",
  },
  {
    icon: Workflow,
    number: "03",
    title: "Metric engine",
    body: "One analytics module turns those signals into engagement, fake-follower, authenticity, and growth figures.",
  },
  {
    icon: ChartNoAxesCombined,
    number: "04",
    title: "Analysis out",
    body: "Open the full profile analysis, compare up to four handles, or download a PDF report.",
  },
];

const ENGINE: EngineCard[] = [
  {
    icon: Gauge,
    label: "Engagement rate",
    kind: "Measured",
    basis: "(likes + comments + saves) / followers x 100",
    body: "Saves count only when every sampled post exposes them. Otherwise the rate uses likes and comments.",
  },
  {
    icon: ShieldCheck,
    label: "Fake followers estimate",
    kind: "Modeled",
    basis: "Bounded 2-65% model",
    body: "Follower/following balance, engagement against size benchmarks, comment-to-like ratio, engagement stability, verification, follower tier, and posting history.",
  },
  {
    icon: Sparkles,
    label: "Authenticity",
    kind: "Modeled",
    basis: "100 - modeled fake share",
    body: "Derived from the fake-follower model. A higher score means the public signals look more consistent with a real audience.",
  },
  {
    icon: TrendingUp,
    label: "12-month growth",
    kind: "Modeled",
    basis: "Public signals, not history",
    body: "Engagement strength, authenticity, posting cadence, reach proxy, engagement trend, and account size. Instagram does not publish historical follower counts.",
  },
];

const AVAILABLE_SIGNALS = [
  "Followers, following, and total post count",
  "Name, username, bio, category, and verification",
  "Recent posts with date, type, caption, likes, comments, and views",
  "Public profile pages and post embeds, cached for five minutes",
];

const UNAVAILABLE_SIGNALS = [
  "Saves and reach for most public accounts",
  "Audience demographics: age, gender, and country",
  "Measured 12-month follower history",
  "Posts from private accounts or accounts with no visible media",
];

const CONFIDENCE_LEVELS = [
  { level: "High", rule: "10+ visible posts and verified or 10K+ followers" },
  { level: "Medium", rule: "5+ visible posts" },
  { level: "Low", rule: "Fewer than 5 visible posts" },
];

function SectionTitle({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">{title}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-500">{body}</p>
    </div>
  );
}

export default function Home() {
  return (
    <div data-testid="analysis-dashboard" className="space-y-10">
      <section className="flex flex-col gap-6 rounded-2xl bg-slate-950 px-7 py-8 text-white md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">
            Profile intelligence
          </p>
          <h1 className="mt-2 max-w-xl text-3xl font-semibold tracking-tight">
            Analyze any public Instagram account.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
            Enter a username to see how public signals become engagement and audience-quality
            metrics. No API keys or Meta app needed.
          </p>
        </div>

        <HandleLookup />
      </section>

      <GlobalPulse />

      <section data-testid="pipeline" className="space-y-5">
        <SectionTitle
          eyebrow="Analysis pipeline"
          title="From username to insight in four steps"
          body="Every lookup follows the same path, whether it comes from a public page or the optional official API."
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PIPELINE.map((step) => {
            const Icon = step.icon;
            return (
              <article
                key={step.number}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="text-xs font-semibold tracking-widest text-slate-300">
                    {step.number}
                  </span>
                </div>
                <h3 className="mt-4 text-sm font-semibold text-slate-950">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{step.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section data-testid="metric-engine" className="space-y-5">
        <SectionTitle
          eyebrow="Metric engine"
          title="What Instagram Analytics calculates"
          body="Measured values come from public post interactions. Modeled values are estimates clearly labeled Est. in every view."
        />
        <div className="grid gap-4 md:grid-cols-2">
          {ENGINE.map((metric) => {
            const Icon = metric.icon;
            return (
              <article
                key={metric.label}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <h3 className="text-sm font-semibold text-slate-950">{metric.label}</h3>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      metric.kind === "Measured"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-800"
                    }`}
                  >
                    {metric.kind}
                  </span>
                </div>
                <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
                  {metric.basis}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-slate-500">{metric.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <BenchmarkPanel />

      <section data-testid="source-panel" className="space-y-5">
        <SectionTitle
          eyebrow="Data sources"
          title="What is public and what is not"
          body="Instagram Analytics only reads data Instagram exposes without a login. Anything unavailable is shown as a dash or N/A, never invented."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
              <CircleCheck className="h-4 w-4" aria-hidden="true" />
              Read from public pages
            </h3>
            <ul className="mt-4 space-y-2 text-sm text-emerald-900/80">
              {AVAILABLE_SIGNALS.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <CircleAlert className="h-4 w-4" aria-hidden="true" />
              Not exposed publicly
            </h3>
            <ul className="mt-4 space-y-2 text-sm text-amber-900/80">
              {UNAVAILABLE_SIGNALS.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section data-testid="confidence-legend" className="space-y-5">
        <SectionTitle
          eyebrow="Estimate confidence"
          title="How much data supports an estimate"
          body="Every modeled profile shows a confidence level and the exact signals used on its analysis page."
        />
        <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-3">
          {CONFIDENCE_LEVELS.map((item) => (
            <div key={item.level} className="border-slate-100 md:border-r md:px-4 md:first:pl-0 md:last:border-0">
              <p className="text-sm font-semibold text-slate-950">{item.level}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.rule}</p>
            </div>
          ))}
        </div>
      </section>

      <WeeklyDigestSignup />

      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Link
          href="/compare"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
        >
          <GitCompareArrows className="h-4 w-4" aria-hidden="true" />
          Compare handles
        </Link>
        <Link
          href="/profile/nora.style"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
        >
          <FileDown className="h-4 w-4" aria-hidden="true" />
          View a sample analysis
        </Link>
        <p className="ml-auto text-xs text-slate-400">
          Demo fixtures remain available by direct URL.
        </p>
      </section>
    </div>
  );
}
