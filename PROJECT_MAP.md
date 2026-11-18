# PROJECT_MAP.md — Instagram Profile Analytics (v1.3)

> Snapshot: **2026-11-18** (system date confirmed via `shell`)  
> Phase: **COMPLETE for v1.3** — public reader, optional official API, demo fixtures, and disclosed public-signal estimates.  
> Locked user decisions: **no Meta keys required** · **public Instagram handle lookup** · **analysis + comparison + PDF report** · **English / LTR**.  
> Reference positioning: Not Just Analytics = functional core; Modash + Collabstr = visual/dashboard inspiration only.

---

## [TECH_STACK]

All versions read from official registries on 2026-11-18: `registry.npmjs.org`, GitHub Releases, `nodejs.org/dist/index.json`. **`deprecated: null` on every pinned version.**

| Layer | Package | Pinned version | Official evidence | Deprecated |
|---|---|---|---|---|
| Runtime | Node.js | `v26.13.1` (LTS *Lithium*) | nodejs.org dist, 2026-11-10 | no |
| Framework | `next` | `16.4.6` | npm + GitHub `v16.4.6`, 2026-11-09 | no |
| UI | `react`, `react-dom` | `19.3.1` | npm + GitHub `v19.3.1`, 2026-10-14 | no |
| Language | `typescript` | `6.0.3` | npm `6.0.3`, 2026-04-16; TS 7.0.2 is blocked by typescript-eslint bundled with `eslint-config-next` 16.4.6 | no |
| Styling | `tailwindcss`, `@tailwindcss/postcss` | `4.3.5` | npm + GitHub `v4.3.5`, 2026-11-06 | no |
| CSS processing | `postcss` | `8.5.33` | npm latest | no |
| Charts | `recharts` | `3.11.0` | npm + GitHub `v3.11.0`, 2026-11-17 | no |
| PDF | `pdf-lib` | `1.17.1` | npm + GitHub `v1.17.1` (last stable, still supported) | no |
| Icons | `lucide-react` | `1.75.0` | npm + GitHub `1.75.0`, 2026-11-18 | no |
| Tests | `vitest` | `5.1.1` | npm + GitHub `v5.1.1`, 2026-11-17 | no |
| Lint | `eslint` + `eslint-config-next` | `10.15.0` + `16.4.6` | npm latest | no |
| Types | `@types/node`, `@types/react`, `@types/react-dom` | `26.6.6`, `19.3.0`, `19.3.0` | npm latest | no |
| Format | `prettier` | `3.10.1` | npm latest | no |

**Explicitly evaluated and rejected (No Feature Creep):**
- `@tanstack/react-table@9.3.1` — a native `<table>` is sufficient for ≤4 comparison columns.
- `date-fns@4.4.0` — `Intl.DateTimeFormat` covers the only date label needed.
- `@react-pdf/renderer`, `puppeteer` — `pdf-lib` is lighter and server-safe.
- `zod@4.6.7` — handle validation is a regex plus seed lookup; no schema engine needed.
- `@playwright/test@1.65.1` — deferred; verification is Vitest + route smoke.
- `typescript@7.0.2` — rejected at execution time: `typescript-eslint` (via `eslint-config-next` 16.4.6) hard-fails with “does not support TS 7.0”; pinned `6.0.3` instead so the lint gate remains real, not skipped.
- Dedicated Instagram scraper libraries — rejected: extra dependency weight and unstable APIs. The public reader instead parses the server-rendered HTML that Instagram already serves to crawlers, and the official Business Discovery endpoint remains available when credentials exist.

**Next.js 16 constraints respected:** `params`/`searchParams` are async; `next lint` was removed → call `eslint` directly; no `middleware.ts`; Tailwind v4 via `@tailwindcss/postcss`; no deprecated `revalidateTag(tag)` single-arg form.

**Pinning rule:** exact versions, no `^`, no prerelease, commit lockfile.

---

## [SYSTEM_FLOW]

Actor: an analyst checking public Instagram profiles. No login, no database.

```
/ (handle lookup + analysis dashboard)
  └─ exact username
       ├─ seeded demo → local fixture → /profile/[username]
       ├─ official API configured → Business Discovery
       │    └─ failure → public web page reader
       └─ no credentials → public web page reader → /profile/[username]
              ├─ add handles → /compare?handles=a,b,c,d → side-by-side table (max 4)
              └─ request report → /api/report?handles=a,b → PDF download
```

### Resolution contract (`core/data/adapter.ts`)

`resolveProfile(handle)` returns one of:

- `found` — a demo, public-web, or official-API `CreatorProfile`
- `not_found` — unknown public handle
- `error` — rate limit, network, unreadable page, auth, or API failure

Resolution order: seeded demo → optional official API → public web reader. When no
credentials exist the public reader is the only network path. Public failures never
mention Meta keys.

### Metrics contract (single source: `core/analytics/metrics.ts`)

- `avgLikes / avgComments / avgSaves` = mean over the profile's recent posts.
- `engagementRate = round2(((avgLikes + avgComments + (avgSaves ?? 0)) / followers) * 100)`
- `engagementBasis` = `likes+comments+saves` when every post has saves, else `likes+comments`.
- `followerGrowthPct` = measured history when there are at least two monthly points; otherwise a public-signal estimate for non-demo profiles with visible posts; otherwise `null`.
- `authenticityPct` = measured `(1 - fakeFollowers / followers) * 100` when fixture data exists; otherwise a public-signal estimate for non-demo profiles with visible posts; otherwise `null`.
- `fakeFollowers / fakeFollowersPct` = fixture value when present, else the modeled count/share, else `null`.
- `growthEstimated / authenticityEstimated` = `true` only when a modeled value was actually used.
- `estimateConfidence / estimateSignals / estimateMethodology` = populated only when an estimate is used; `null` / `[]` otherwise.
- Demo profiles never call the estimator. Private accounts, empty feeds, and zero-follower accounts produce no estimates.
- `round2(n) = Math.round((n + Number.EPSILON) * 100) / 100`

Fixture anchor `nora.style`: `followers=10000`, `fakeFollowers=350`, followers `8000 → 10000`, 4 posts with likes `100,200,150,50`, comments `10,20,15,5`, saves `20,40,30,10` → ER **1.63%**, growth **25%**, authenticity **96.5%**.

### Verifiable goals (milestones)

| ID | Milestone | Goal / Acceptance criteria | Verification |
|---|---|---|---|
| **G1** | Seed + adapter | 8 fixtures; `searchProfiles("beauty")` returns only matches; unknown demo handle → `null`, never throws. | `tests/adapter.test.ts` green |
| **G2** | Home `/` | Handle lookup form + analysis dashboard: four-step pipeline, metric engine, public sources, and confidence legend. No demo cards or filter on the landing page. | HTTP 200 + rendered section checks |
| **G3** | Profile `/profile/[username]` | Header, 4 KPI cards, growth chart, interactions chart, posts table, audience. Anchor values: ER **1.63%**, growth **25%**, authenticity **96.5%**. | HTTP 200 + DOM blocks + `tests/metrics.test.ts` |
| **G4** | Compare `/compare?handles=...` | Up to 4 columns, identical labels; >4 → first 4 + `warn` log; unavailable handle → notice, no crash. | DOM column count + logger assertion |
| **G5** | PDF `/api/report?handles=...` | `200`, `application/pdf`, `Content-Disposition: attachment; filename="ig-analysis-a-b.pdf"`, bytes start `%PDF`, `PDFDocument.load` succeeds; unavailable handle → `400` JSON. Live names/captions are ASCII-sanitized and audience is optional. | `tests/report.test.ts` + byte/header check |
| **G6** | Safe logging | `info/warn/error` only; bounded queue (200, drop-oldest + one-time warn); enqueue is synchronous/`void`, flush batched via `setImmediate`; no token/PII logging. | `tests/logger.test.ts` + grep for `await log.` |
| **G7** | Quality gate | Zero `TODO`/`FIXME`/`placeholder` strings; no orphan imports; `npm test`, `npm run typecheck`, `npx eslint .`, `npm run build` all exit 0. | grep + 4 commands |
| **G8** | Optional official API adapter | Business Discovery URL, bearer header, 8s timeout, 5-minute/100-entry cache, mapped errors (`190`, `4/17/32/613`, `100/404`), nullable metrics. | `tests/live.test.ts` with mocked `fetch` |
| **G9** | Public web reader | Server-rendered profile fetch, embedded JSON parsing, Open Graph post count, pk→shortcode/timestamp, 4-way embed concurrency, 5-minute/100-entry cache, private accounts, partial embed failures, explicit error kinds. | `tests/public.test.ts` with mocked profile and embed HTML |
| **G10** | Public disclosure UI | “Public web” badges, limitation notices, private-account handling, source-aware comparison/report labels, username-only lookup with no key messaging. | Route smoke + typecheck/build |
| **G11** | Disclosed public-signal estimates | Fake followers, authenticity, and 12-month growth appear for any public/official profile with visible posts; `Est.` badge, confidence, methodology, and signals are disclosed; demo fixtures keep exact values; private/no-post accounts return `null`/`—`. | `tests/estimates.test.ts`, updated adapter/metrics/report tests, route smoke |
| **G12** | Resilient public fetch | When crawler HTML has no posts, try `web_profile_info` and use inline engagement; show an explicit no-posts notice with `—` instead of zeros when neither source exposes posts. | `tests/public.test.ts` fallback + gated-account cases, route smoke |

Goal order is strict: **G1 → G2 → G3 → G4 → G5 → G6 → G7 → G8 → G9 → G10 → G11 → G12**. No step is marked done until its verification passes.

---

## [ARCHITECTURE]

Feature-based, server-first, no micro-files. `core/` exists **only** for logic genuinely reused by ≥2 features.

```
src/
├─ app/
│  ├─ layout.tsx                         # shell, nav, live/demo indicator
│  ├─ page.tsx                           # handle lookup + analysis dashboard (server component)
│  ├─ profile/[username]/page.tsx        # async params → resolveProfile → ProfileDashboard
│  ├─ compare/page.tsx                   # async searchParams → resolveProfile → ComparisonTable
│  └─ api/report/route.ts                # GET → resolveProfile → reportDocument → PDF Response
├─ features/
│  ├─ discovery/HandleLookup.tsx         # "use client" — validated username → /profile/[username]
│  ├─ profile/ProfileDashboard.tsx       # ONE file: header + KPIs + estimate panel + charts + posts
│  ├─ comparison/ComparisonTable.tsx     # ONE file: table + notices + estimate-basis row
│  └─ report/reportDocument.ts           # pdf-lib builder, ASCII-safe, estimate notes
├─ core/
│  ├─ data/types.ts                      # CreatorProfile, Post, Audience, MonthlyPoint
│  ├─ data/seed.ts                       # 8 demo fixtures, source: "demo"
│  ├─ data/adapter.ts                    # listProfiles / searchProfiles / getProfile / resolveProfile
│  ├─ data/public.ts                     # public-page reader, parsers, pk helpers, cache, error kinds
│  ├─ data/live.ts                       # optional Business Discovery fetch, mapping, cache, error kinds
│  ├─ analytics/estimates.ts             # public-signal models + confidence/signals/methodology
│  ├─ analytics/metrics.ts               # measured metrics + disclosed estimate fallback
│  ├─ format.ts                          # nullable-aware compact numbers, percentages, dates
│  └─ logging/logger.ts                  # bounded async queue, levels info/warn/error
├─ components/
│  ├─ MetricCard.tsx                     # used in profile analysis
│  └─ EmptyState.tsx                     # used in profile and compare
└─ tests/
   ├─ metrics.test.ts
   ├─ estimates.test.ts
   ├─ adapter.test.ts
   ├─ report.test.ts
   ├─ logger.test.ts
   ├─ live.test.ts
   └─ public.test.ts
```

**Rules**
- Demo handles are served from local fixtures with no network calls.
- Public mode performs one profile request plus up to 12 embed requests per uncached handle, four at a time. When the crawler page has no posts, one `web_profile_info` request is attempted; its inline likes/comments/views replace embed requests when available.
- The optional official API performs exactly one outbound `GET` to `graph.facebook.com` per uncached handle; failure falls back to the public reader.
- The access token travels in the `Authorization: Bearer` header, never the query string, and is never logged.
- `"use client"` limited to `ProfileDashboard` (charts) and `HandleLookup` (navigation + validation). Data loading stays in server components/route handlers.
- Any failure (unknown handle, >4 handles, rate limit, network, PDF build error) becomes an `EmptyState`, `400`, or `500` **and** is logged — never an unhandled throw.
- `core/data/public.ts` owns every public-page selector and embed parser; UI and metrics never parse HTML.
- No placeholders, no `TODO`, no speculative abstraction.

### Public lookup limitations

- The target account must be **public**. Private accounts expose follower/following/post counts only.
- Exact-username lookup only. Instagram does not expose global keyword or creator search through public pages.
- Measured saves, reach, audience demographics, and follower history are unavailable. Fake-follower, authenticity, and 12-month-growth values are modeled estimates when public posts are visible.
- Pinned posts are excluded from the recent-post sample so stale metrics do not skew engagement.
- Public pages can rate-limit or change markup; failures surface as retryable messages. Instagram can hide every post from logged-out pages: when both the HTML and `web_profile_info` fallback expose no posts, the UI shows an explicit `no-posts-notice` with `—` metrics instead of false zeros.
- This reader is unofficial and independent of the official API. When official credentials exist, the API is tried first.

---

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `IG_ACCESS_TOKEN` | optional | Long-lived Facebook user token enabling the official API path |
| `IG_BUSINESS_ACCOUNT_ID` | optional | Instagram Business Account ID performing the query |
| `IG_GRAPH_VERSION` | optional | Graph API version, default `v27.0` |

Public lookup needs no environment variables. `.env.example` documents the optional
official API contract; `.env.local` is only needed for that path and is never committed.

---

## [ORPHANS & PENDING]

- No blocking items.
- `[P10]` **Optional:** a real-credential official-API smoke test. Public lookup and all
  mocked API paths are verified. The official path remains structurally tested but does
  not gate v1.2, because the product no longer requires Meta credentials.

---

## Verification log — 2026-11-18

| Gate | Command / probe | Result |
|---|---|---|
| Unit + integration tests | `npm test` | **7 files, 36 tests passed** |
| Static types | `npm run typecheck` | **exit 0** |
| Lint | `npx eslint .` | **exit 0, zero warnings** |
| Production build | `npm run build` | **exit 0**, routes `/`, `/profile/[username]`, `/compare`, `/api/report` |
| Home analysis dashboard | `GET /` | **200**, `analysis-dashboard` + `pipeline` + `metric-engine` + `source-panel` + `confidence-legend`; no “Demo profiles” grid or filter |
| Public profile (real) | `GET /profile/trending.vibz.uae` | **200**, 59.1K followers, 453 posts, verified, 11 recent posts, ER **1.33%**, fake followers **5.9K (10%)**, authenticity **90.00% est.**, growth **-3.47% est.**, “Public web” badge and “High confidence” disclosure panel |
| Public home copy | `GET /` | **200**, “Public web” badge, “No API keys” lookup copy |
| Public comparison with estimates | `GET /compare?handles=trending.vibz.uae,nora.style` | **200**, public + demo rows, `5.9K est.`, `-3.47% est.`, `90.00% est.`, `High confidence`, `Demo fixture`, `Estimate basis` |
| Public PDF with estimates | `GET /api/report?handles=trending.vibz.uae,nora.style` | **200**, `application/pdf`, **2,431 bytes**, expected filename; builder emits per-profile confidence and footer disclaimer |
| Unknown public handle | `GET /profile/nope.9988.xyz` | **200**, “Profile not found”, public message; only global “No API keys required” sidebar copy |
| Demo profile isolation | `GET /profile/nora.style` | **200**, `1.63%`, `25.00%`, `96.50%`, no `Est.` badge or estimate panel |
| PDF error path | `GET /api/report?handles=ghost.account` | **400**, `Unavailable handle(s)` |
| Estimate units | `tests/estimates.test.ts` | strong/weak signal scoring, confidence levels, bounds, disclosure fields, private/empty/zero-follower guards, demo isolation |
| Public reader units | mocked profile + embed HTML | mapping, pk helpers, cache, pinned skip, partial embed, private, 404, 200 shell, 429, API fallback, `web_profile_info` fallback with inline engagement, gated no-post profile |
| Gated public handle (real) | `GET /profile/the.matis` | **200**, 1M followers / 1,314 following / 1,546 posts from Open Graph; `no-posts-notice` shown, engagement `—`, no false `0.00%` |
| Official API adapter | mocked `fetch` | URL, bearer header, mapping, `190`, `100`, public fallback all pass |
| Public PDF safety | emoji/Arabic name + no audience | valid `%PDF-` document |
| Code hygiene | grep | no `TODO`/`FIXME`/`PLACEHOLDER`, no `await log.`, no `console.log`/`debugger` |

---

## Deferred — out of v1.3 by explicit user decision (not orphans)

- Audience demographics, saves, reach, and follower history for public accounts — unavailable from public pages and Business Discovery.
- Keyword / creator discovery search — not offered by Instagram's public pages or API.
- Authenticated account insights, saved lists, client-branded reports, billing.
- Marketplace, campaigns, chat, escrow/payments (Modash/Collabstr scope deliberately excluded).
- Arabic RTL / bilingual toggle, Playwright E2E suite.
