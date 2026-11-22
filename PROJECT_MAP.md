# PROJECT_MAP.md — Instagram Analytics (v1.5)

> Snapshot: **2026-11-20** (system date confirmed via `shell`)  
> Phase: **COMPLETE for v1.5** — public reader, free local proxy bridge for cloud hosts, optional official API, demo fixtures, disclosed public-signal estimates, and the free 30-day weekly digest.  
> Locked user decisions: **no Meta keys required** · **public Instagram handle lookup** · **analysis + comparison + PDF report** · **English / LTR** · **no paid scraping credits** · **Vercel + authenticated local proxy through a free Cloudflare Tunnel** · **weekly digest via Resend + Upstash with a display-only 30-day trial**.  
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
| Email | Resend REST API | external free-tier service | resend.com/docs | no |
| Icons | `lucide-react` | `1.75.0` | npm + GitHub `1.75.0`, 2026-11-18 | no |
| Tests | `vitest` | `5.1.1` | npm + GitHub `v5.1.1`, 2026-11-17 | no |
| Lint | `eslint` + `eslint-config-next` | `10.15.0` + `16.4.6` | npm latest | no |
| Types | `@types/node`, `@types/react`, `@types/react-dom` | `26.6.6`, `19.3.0`, `19.3.0` | npm latest | no |
| Format | `prettier` | `3.10.1` | npm latest | no |
| Tunnel (external) | `cloudflared` | latest stable | Cloudflare install via `winget`; no npm dependency | no |

**Explicitly evaluated and rejected (No Feature Creep):**
- `@tanstack/react-table@9.3.1` — a native `<table>` is sufficient for ≤4 comparison columns.
- `date-fns@4.4.0` — `Intl.DateTimeFormat` covers the only date label needed.
- `@react-pdf/renderer`, `puppeteer` — `pdf-lib` is lighter and server-safe.
- `zod@4.6.7` — handle validation is a regex plus seed lookup; no schema engine needed.
- `@playwright/test@1.65.1` — deferred; verification is Vitest + route smoke.
- `typescript@7.0.2` — rejected at execution time: `typescript-eslint` (via `eslint-config-next` 16.4.6) hard-fails with “does not support TS 7.0”; pinned `6.0.3` instead so the lint gate remains real, not skipped.
- Dedicated Instagram scraper libraries — rejected: extra dependency weight and unstable APIs. The public reader instead parses the server-rendered HTML that Instagram already serves to crawlers, and the official Business Discovery endpoint remains available when credentials exist.
- ScrapingBee / paid residential proxies — rejected after Vercel datacenter 429s: credits were exhausted without a persistent fix. The free local proxy bridge uses the home IP and matches `localhost` results with no per-request cost.

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
       └─ no credentials → public web page reader
              ├─ INSTAGRAM_PROXY_URL set (Vercel) → authenticated /api/instagram-proxy
              │    └─ through Cloudflare Tunnel → local server → home IP → Instagram
              │         └─ proxy 401/5xx/network failure → direct public fetch
              └─ no proxy URL (local) → direct public page fetch
         → /profile/[username]
              ├─ add handles → /compare?handles=a,b,c,d → side-by-side table (max 4)
              └─ request report → /api/report?handles=a,b → PDF download
```

### Resolution contract (`core/data/adapter.ts`)

`resolveProfile(handle)` returns one of:

- `found` — a demo, public-web, or official-API `CreatorProfile`
- `not_found` — unknown public handle
- `error` — rate limit, network, unreadable page, auth, or API failure

Resolution order: seeded demo → optional official API → public web reader. Inside the
public reader, a configured `INSTAGRAM_PROXY_URL` sends every request (profile HTML,
`web_profile_info`, and post embeds) to the authenticated local proxy endpoint first;
direct fetch is the fallback when the proxy is unreachable or rejects with 401/5xx.
A transient 404, 429, or metadata-free page is retried once. Public failures never
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
| **G13** | Free cloud-host proxy bridge | When `INSTAGRAM_PROXY_URL` is set, all profile/embed/web-profile requests go to the authenticated `/api/instagram-proxy` endpoint through a Cloudflare Tunnel; `PROXY_SECRET` is required in both environments; the endpoint allowlists only public Instagram profile/`web_profile_info`/embed URLs; 401/402/403/5xx and network failures fall back to direct fetch; transient 404/429/empty-shell responses retry once; no secret in logs; no credits or paid keys. | `tests/proxy.test.ts`, `tests/public.test.ts` proxy routing/fallback/retry cases, `npm run build` |
| **G14** | Weekly digest + 30-day trial | Home page email/handle section with consent and honeypot; 30-day trial shown but not enforced; cron-only Monday sender reuses one profile resolution per handle; email includes engagement rate, week-over-week follower decrease, and follower growth with `Est.` label; signed one-click unsubscribe; Resend and Upstash settings keep secrets server-side; top header no longer shows the “Public web” badge. | `tests/digest.test.ts`, route list from `npm run build`, `npx eslint .` |

Goal order is strict: **G1 → G2 → G3 → G4 → G5 → G6 → G7 → G8 → G9 → G10 → G11 → G12 → G13 → G14**. No step is marked done until its verification passes.

---

## [ARCHITECTURE]

Feature-based, server-first, no micro-files. `core/` exists **only** for logic genuinely reused by ≥2 features.

```
src/
├─ app/
│  ├─ layout.tsx                         # shell, nav, live/demo indicator
│  ├─ page.tsx                           # handle lookup + analysis dashboard (server component)
│  ├─ profile/[username]/page.tsx        # async params → resolveProfile → ProfileDashboard
│  ├─ compare/page.tsx                   # async searchParams → resolveProfile → rank table + ComparisonTable + remaining suggestions
│  ├─ api/report/route.ts                # GET → resolveProfile → reportDocument → PDF Response
│  ├─ api/instagram-proxy/route.ts       # authenticated, allowlisted fetch from the local home IP
│  ├─ api/digest/subscribe/route.ts      # POST → validate → store 30-day trial signup
│  ├─ api/digest/send/route.ts           # CRON_SECRET-only Monday sender
│  └─ api/digest/unsubscribe/route.ts    # signed token → delete subscription
├─ features/
│  ├─ discovery/HandleLookup.tsx         # "use client" — validated username → /profile/[username]
│  ├─ profile/ProfileDashboard.tsx       # ONE file: header + KPIs + estimate panel + charts + posts
│  ├─ comparison/ComparisonTable.tsx     # ONE file: table + notices + estimate-basis row
│  ├─ digest/WeeklyDigestSignup.tsx      # "use client" — email + handle + consent → /api/digest/subscribe
│  └─ report/reportDocument.ts           # pdf-lib builder, ASCII-safe, estimate notes
├─ core/
│  ├─ data/types.ts                      # CreatorProfile, Post, Audience, MonthlyPoint
│  ├─ data/seed.ts                       # 8 demo fixtures, source: "demo"
│  ├─ data/adapter.ts                    # listProfiles / searchProfiles / getProfile / resolveProfile
│  ├─ data/public.ts                     # public-page reader, proxy bridge, parsers, pk helpers, cache, error kinds
│  ├─ data/live.ts                       # optional Business Discovery fetch, mapping, cache, error kinds
│  ├─ analytics/compare.ts               # same-country/region four-factor compare ranking
│  ├─ analytics/exclusive.ts             # mutually exclusive curated peer groups per profile page
│  ├─ analytics/regional.ts              # Middle East ±30% post-activity rank + peer card
│  ├─ analytics/estimates.ts             # public-signal models + confidence/signals/methodology
│  ├─ analytics/metrics.ts               # measured metrics + disclosed estimate fallback
│  ├─ digest/validation.ts               # signup validation, normalization, 30-day trial end
│  ├─ digest/subscriptions.ts            # local JSON or Upstash REST signup store
│  ├─ digest/email.ts                    # digest subject/text/html builder with weekly deltas
│  ├─ digest/resend.ts                   # Resend REST sender, no secret logging
│  ├─ digest/tokens.ts                   # signed unsubscribe tokens
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
   ├─ public.test.ts
   ├─ proxy.test.ts
   ├─ compare.test.ts
   ├─ exclusive.test.ts
   └─ digest.test.ts
```

**Rules**
- Demo handles are served from local fixtures with no network calls.
- Public mode performs one profile request plus up to 12 embed requests per uncached handle, four at a time. When the crawler page has no posts, one `web_profile_info` request is attempted; its inline likes/comments/views replace embed requests when available. On Vercel, all three request types go through the authenticated local proxy first; there is no embed cap because the bridge has no per-request cost.
- The local proxy requires `PROXY_SECRET` and allows only `https://www.instagram.com/{username}/`, `/p/{shortcode}/embed/captioned/`, and `/api/v1/users/web_profile_info/` targets. It sends the crawler user agent for HTML and `x-ig-app-id` for the JSON endpoint. Unauthorized, malformed, or non-Instagram targets are rejected before any outbound fetch.
- Weekly digest signups are keyed by a SHA-256 hash of email + handle; raw emails are never logged. The sender resolves each distinct handle once per run, stores the current follower/engagement snapshot, keeps a six-day guard between sends, and does not enforce the displayed 30-day trial. Resend, Upstash, and `CRON_SECRET` credentials stay server-side; unsubscribe links use a signed token.
- The optional official API performs exactly one outbound `GET` to `graph.facebook.com` per uncached handle; failure falls back to the public reader.
- The access token and `PROXY_SECRET` travel in `Authorization: Bearer` headers, never the query string, and are never logged.
- `"use client"` limited to `ProfileDashboard` (charts), `HandleLookup` (navigation + validation), and `WeeklyDigestSignup` (form state). Data loading stays in server components/route handlers.
- Any failure (unknown handle, >4 handles, rate limit, network, PDF build error) becomes an `EmptyState`, `400`, or `500` **and** is logged — never an unhandled throw.
- `core/data/public.ts` owns every public-page selector and embed parser; UI and metrics never parse HTML.
- Country homepage boards sort by follower count descending first; `rankScore()` only breaks ties. Worldwide boards keep the weighted four-factor order with followers at 55%.
- Profile-page benchmarks treat `ola.alqodmani` and `trending.vibz.uae` as a mutually exclusive curated UAE lifestyle group: only the better-scoring member appears across the closest-peer card, peer rank table, regional peer card and regional rank table.
- The profile-page regional panel is a Middle East activity benchmark: it draws from the full Middle East homepage board, hard-gates candidates to the searched profile's ±30% follower band, infers category/activity only from Reel/post captions and hashtags, and ranks the eligible set by the shared `rankScore()`. No out-of-band fallback is allowed.
- Compare pages rank other tracked public profiles from the anchor account's inferred country first, then the same wider region, using `rankScore()`. Handles already in the comparison are excluded from both the `compare-rank` table and the remaining `compare-suggestions`.
- No placeholders, no `TODO`, no speculative abstraction.

### Public lookup limitations

- The target account must be **public**. Private accounts expose follower/following/post counts only.
- Exact-username lookup only. Instagram does not expose global keyword or creator search through public pages.
- Measured saves, reach, audience demographics, and follower history are unavailable. Fake-follower, authenticity, and 12-month-growth values are modeled estimates when public posts are visible.
- Pinned posts are excluded from the recent-post sample so stale metrics do not skew engagement.
- Public pages can rate-limit or change markup; failures surface as retryable messages. Datacenter IPs (including Vercel functions) are refused with HTTP 429, so the public deployment requires the local proxy bridge and the computer running it must stay on and connected. Instagram can hide every post from logged-out pages: when both the HTML and `web_profile_info` fallback expose no posts, the UI shows an explicit `no-posts-notice` with `—` metrics instead of false zeros.
- This reader is unofficial and independent of the official API. When official credentials exist, the API is tried first.

---

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `INSTAGRAM_PROXY_URL` | required on Vercel | Cloudflare Tunnel URL of the local `/api/instagram-proxy` endpoint; unset locally for direct fetch |
| `PROXY_SECRET` | required for the bridge | Shared secret set in both Vercel and local `.env.local`; never committed or logged |
| `IG_ACCESS_TOKEN` | optional | Long-lived Facebook user token enabling the official API path |
| `IG_BUSINESS_ACCOUNT_ID` | optional | Instagram Business Account ID performing the query |
| `IG_GRAPH_VERSION` | optional | Graph API version, default `v27.0` |
| `RESEND_API_KEY` | required for digest delivery | Resend API key used by `/api/digest/send` |
| `DIGEST_FROM_EMAIL` | required for digest delivery | Verified Resend sender address |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | required on Vercel | Upstash REST credentials for durable signup storage |
| `CRON_SECRET` | required for digest delivery | Vercel Cron bearer token and unsubscribe-link signing secret |

Local direct lookup needs no environment variables. The public Vercel deployment needs
`INSTAGRAM_PROXY_URL` and `PROXY_SECRET`; the local server needs `PROXY_SECRET` to
answer the proxy route. Weekly digest delivery additionally needs the Resend, Upstash,
and cron variables. `.env.example` documents the contract; `.env.local` is never committed.
Secrets are read server-side only and are never logged. `README.md` contains the
Cloudflare Tunnel setup, permanent hostname, Vercel variables, digest setup, and
smoke-test steps.

---

## [ORPHANS & PENDING]

- No blocking items.
- `[P13]` **Deployment operator step:** create the Cloudflare Tunnel hostname, set
  `PROXY_SECRET` in local `.env.local` and Vercel, set `INSTAGRAM_PROXY_URL` in Vercel,
  delete any stale `SCRAPINGBEE_API_KEY`, and smoke-test the public URL. This cannot be
  completed from the repository alone because it requires the user's domain and secret.
- `[P14]` **Deployment operator step:** add `RESEND_API_KEY`, `DIGEST_FROM_EMAIL`,
  `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and `CRON_SECRET` to Vercel to
  activate the weekly digest sender and durable signups. The form works locally without
  them, but Vercel returns a configuration error until delivery is present.
- `[P10]` **Optional:** a real-credential official-API smoke test. Public lookup and all
  mocked API paths are verified. The official path remains structurally tested but does
  not gate v1.2, because the product no longer requires Meta credentials.

---

## Verification log — 2026-11-20

| Gate | Command / probe | Result |
|---|---|---|
| Unit + integration tests | `npm test` | **9 files, 59 tests passed** |
| Static types | `npm run typecheck` | **exit 0** |
| Lint | `npx eslint .` | **exit 0, zero warnings** |
| Production build | `npm run build` | **exit 0**, routes `/`, `/profile/[username]`, `/compare`, `/api/report`, `/api/instagram-proxy`, `/api/digest/subscribe`, `/api/digest/send`, `/api/digest/unsubscribe` |
| Home analysis dashboard | `GET /` | **200**, `analysis-dashboard` + `pipeline` + `metric-engine` + `source-panel` + `confidence-legend`; no “Demo profiles” grid or filter |
| Public profile (real) | `GET /profile/trending.vibz.uae` | **200**, 59.1K followers, 453 posts, verified, 11 recent posts, ER **1.33%**, fake followers **5.9K (10%)**, authenticity **90.00% est.**, growth **-3.47% est.**, “Public web” badge and “High confidence” disclosure panel |
| Public profile (real) | `GET /profile/natgeo` | **200**, real National Geographic public data; no “temporarily limiting” notice after removing the stale Worker route and restoring the tunnel connection |
| Public proxy bridge | `GET https://analytics-proxy.instagram-analytics.com/api/instagram-proxy?url=...` with `PROXY_SECRET` | **200**, Instagram HTML returned from the home IP through the tunnel; stale Worker route removed after it caused HTTP 429 |
| Windows tunnel service | `Get-Service cloudflared` + `cloudflared tunnel info trending-analytics-proxy` | service **Running / Automatic** with `--config` and `tunnel run` in `ImagePath`; active connector after fixing LocalSystem config and removing the manual tunnel |
| Local app logon task | `Get-ScheduledTask -TaskName 'Instagram Analytics Dev Server'` + `Start-ScheduledTask` | task now runs `next start -H 127.0.0.1 -p 3000` directly with **3 restarts at 1-minute intervals**; prior `npm run dev` action exited with `0xC000013A`, causing the proxy outage to appear as `Profile not found`; after cleanup/restart, public `natgeo`, `nasa`, `instagram`, `cristiano`, `trending.vibz.uae`, and `nora.style` all return data with no error marker |
| Local app watchdog | `schtasks /Query /TN 'Instagram Analytics Watchdog'` + forced port-3000 kill | minute task checks port 3000 and starts the main task if absent; restored the server in **25 s** during a simulated exit; `amrmaskoun` then returned real data (ER **0.99%**, Est. growth **-0.08%**, authenticity **92.00%**) instead of a bridge-offline message |
| Watchdog registration fix | Export-ScheduledTask + scheduled-task info before/after 70 s wait | task created with `schtasks /Create` skipped runs because of default `DisallowStartIfOnBatteries`/`StopOnIdleEnd`; re-registered with `Register-ScheduledTask` using `AllowStartIfOnBatteries`, `DontStopIfGoingOnBatteries`, `DontStopOnIdleEnd`; verified firing 5:31:09 PM → 5:32:10 PM with `LastTaskResult 0`; **do not use `schtasks /Create` for this watchdog** |
| Windowless watchdog | forced port-3000 kill + 90 s process-window sampling | task action changed from `powershell.exe -WindowStyle Hidden` to `wscript.exe //B watchdog.vbs`, whose `shell.Run ..., 0` hides PowerShell entirely; verified firing 6:53:03 PM → port restored 6:53:07 PM with `LastTaskResult 0` and **no visible windows** for `powershell`, `wscript`, `node`, or `conhost` |
| Windowless app task | stopped app/port → re-registered with `app.vbs` → started + 60 s window sampling | the `Running next.config.ts took 166ms` console came from `node.exe` launched by the app task, not the watchdog; action changed to `wscript.exe //B app.vbs` using `shell.Run(command, 0, True)` (hidden console, task stays `Running` until server exits); verified port 3000 listening at 7:05:04 PM, `LastTaskResult 267009`, **no visible windows**, and public `amrmaskoun` ER **0.99%** |
| Hidden watchdog wait fix | two consecutive forced port-3000 kills + 150 s sampling | `watchdog.vbs` changed from `shell.Run ..., 0, False` to `shell.Run ..., 0, True` so Task Scheduler waits for the hidden PowerShell; fire-and-forget mode intermittently skipped the restart; verified watchdog 7:09:03 → 7:10:03 restored port in 12 s, then 7:10:03 → 7:11:03 restored in 31 s, both `LastTaskResult 0`, **no visible windows** |
| VPS egress test script | `bash scripts/egress-test.sh natgeo` on the known-good home IP | new `scripts/egress-test.sh` mirrors the exact `public.ts` headers and makes only 2 requests; verified **PASS** with `og:title=National Geographic ... @natgeo`, `user-json=2`, `blocker=none`; `web_profile_info` returned HTTP **429** even from the good IP, so it is now informational only — the profile page decides the verdict; login-wall detection uses the final redirect URL because normal logged-out pages contain an `accounts/login` header link; unknown handles return `INCONCLUSIVE` (exit 2), not `FAIL` |
| Private-repo transfer fix | `curl` to `raw.githubusercontent.com/.../scripts/egress-test.sh` returned **404** on both `main` and `master` | GitHub API and repo page also returned 404 unauthenticated, confirming the repo is private; README and script header now instruct `scp` from the local checkout instead of a public raw URL |
| Hostinger KVM 1 egress test | `egress-test.sh` + explicit `curl -4` on the new VPS (2026-11-21) | IPv6 (`2a02:4780:...`) gave profile page HTTP **429**, `og:title=none`, `user-json=0`, blocker `429 rate limit`, `web_profile_info` HTTP **404**; dedicated IPv4 (`189.31.39.11`) also gave `status=429 final_url=https://www.instagram.com/accounts/login/`; **both IPs blocked** — refund within 30 days; confirms provider swapping cannot fix datacenter egress, so PC-independent operation needs always-on residential/mobile egress |
| Resend domain + real digest send | Resend dashboard Domains/Emails + production `/api/digest/send` (2026-11-21) | `updates.instagram-analytics.com` showed **Verified**; subscribed `safiwani@hotmail.com` to `natgeo` (201), first send returned `due:0` despite a valid Upstash record; root cause was `parseSubscription()` rejecting the JSON string from Upstash `GET` (local store returned objects) — fixed to accept both, added `listDueSubscriptions` regression test with mocked Upstash; after deploy send returned `{"ok":true,"due":1,"sent":1,"failed":0}`, Resend shows **Delivered**, and Upstash record has `lastSentAt` plus follower/ER snapshot for next week's delta |
| Official Meta API — PC-independent check | Vercel Production env + `curl` to public profiles with cloudflared stopped/process killed (2026-11-21) | `IG_ACCESS_TOKEN` (Secret) and `IG_BUSINESS_ACCOUNT_ID` (Config) present in Production; `GET /profile/{natgeo,the.matis,ola.alqodmani,trending.vibz.uae}` all returned **200** with live follower counts (267.7M / 1.1M / 51.5K / 58.9K), no outage copy; Vercel logs for those request IDs show only `instagram live profile loaded {posts:12}` with **zero** `instagram fetched through local proxy` or bridge-offline entries. cloudflared service auto-restarted during the probe, so a hard network sever was not sustained — but the per-request logs prove the bridge was never called. Local tunnel restored and `X-Instagram-Proxy: ok` confirmed afterwards. Caveats documented: Business/Creator-only coverage, ~60-day token refresh, no 12-month history |
| Public home copy | `GET /` | **200**, no header source badge, weekly digest signup visible, “No API keys” lookup copy |
| Global pulse + Modash benchmark | Vercel Production `GET /` after deploy (2026-11-21) | **200** in ~1.4 s; `global-pulse`, `trending-list`, `engagement-list`, and `modash-benchmark` all present. Trending (last 15 days) top 3: `badgalriri` **1.24%**, `cristiano` **0.89%**, `billieeilish` **0.78%**; high-engagement top 3: `zendaya` **3.70%**, `billieeilish` **3.37%**, `virat.kohli` **2.88%** — ten real entries each, all linked to their analysis. Modash panel shows Nano 5-10%, Micro 3-7%, Macro 1-3%, Mega 0.5-2% with methodology link and directional-comparison caveat. `Official API` badge removed from profile header and compare column headers; remaining occurrences are the disclosure notice and the explicit Source row. 66 tests, typecheck, eslint, and build pass |
| 30-day growth + peer benchmark + UAE copy | Local gates + Vercel Production `GET /` and `GET /profile/natgeo` after deploy (2026-11-22) | 71 tests (incl. `growth.test.ts`, `peer.test.ts`), typecheck, eslint, build pass. Demo growth stays exact/never modeled (uses last two monthly points); live/public 30-day follower change is labelled **Est.** Profile page renders `growth-analysis` (momentum, follower change, interaction trend, cadence, posts in 30 days) and `peer-benchmark` (closest tracked real profile by audience size/topic/engagement, with comparison link). Hero carries the "Leading Instagram analytics platform in the UAE" positioning line. Tracked pool expanded to 25 real handles and shared via `getTrackedProfiles()`; fetch guarded by `isLiveConfigured()`; profile pages read a 30-min Upstash snapshot (`tracked-store.ts`) instead of firing 25 Meta calls per load — without it, repeated profile loads hit Meta `code 4` rate limits and showed the peer empty state. Empty pools are never written so a rate limit cannot wipe a good snapshot. Peer benchmark upgraded to a `peer-ranking` table: the searched profile is included with its closest peers, ordered by engagement rate, with its rank (e.g. "Rank #2 of 6") and share of peers outperformed. 76 tests, typecheck, eslint, build pass |
| Verification badge, 30-day growth placement, UAE/GCC peer + ranking | Local gates + Vercel Production `GET /profile/natgeo` and `GET /profile/nora.style` (2026-11-22) | 82 tests (incl. new `regional.test.ts`), typecheck, eslint, build pass. `verification-badge` in the header shows Verified / Not verified from the public IG badge; verification is also one of the four UAE/GCC key comparisons and is called out in the analysis note. `30-day growth` card moved into `metric-grid` beside 12-month growth (Est. badge/hint preserved) and the full `growth-analysis` section moved directly beneath the grid. New `regional-benchmark` section matches the searched profile to the closest real UAE/GCC account by business category/audience/engagement (`UAE_GCC_HANDLES` curated from live-verified handles), always returns an **80-99% relative category match**, shows four key comparisons (Followers, Engagement rate, Authenticity est., Verification) in the existing card design, and ranks the profile among the top 10 UAE/GCC peers with rank + peers outperformed. `profileTopics` exported from `peer.ts` for topic reuse. Production verified: `natgeo` **Rank #11 of 11** (ahead of 0%; real peers burjkhalifa, the.matis, emirates, visitqatar, qatarairways, khaleejtimes, timeoutdubai, hudabeauty, dubaimall, gulfnews — all 90-93% match), `nora.style` **Rank #1 of 11** (ahead of 100%); all four key comparisons and `verification-badge` present; header badge Verified for both, with peer Not verified. Demo exactness intact (1.63% / 25.00% / 96.50%, no Est.). The regional pool reads the shared Upstash `analytics:tracked-pool` snapshot (rebuilt to 37 real profiles after the handle expansion); a dedicated regional fetch was tried and reverted because Meta `code 4` rate limits hit when it fired 16 extra calls right after the homepage's 40-call refresh |
| Category-only benchmark matching | Local gates + Vercel Production `GET /profile/nora.style`, `/profile/natgeo`, `/profile/emirates`, `/profile/dubaimall` after deploy `df87c27` (2026-11-22) | 93 tests (incl. new `category.test.ts`), typecheck, eslint, build pass. New `src/core/analytics/category.ts` infers Instagram-style categories from the public name/bio (the live API only returns generic `Instagram Professional`) and gates both benchmark pools: the 12 listed creator categories are mutually comparable (`creator` group), while news/media, travel-business, business, sport and music stay isolated. Fixed the `mall`-inside-`small.uae` false positive with start-of-word keyword matching, moved the explicit `content creator` signal ahead of business keywords, and added airline/hotel/landmark keywords so `flydubai`, `qatarairways`, `burjkhalifa` and `rafflesdubai` are no longer treated as creators; all 38 tracked handles now classify sensibly. Peer and ranking rows show category badges and empty states say "No public account in a similar category...". Production verified: `nora.style` peer ranking **#1 of 6** (all creator categories — Beauty, Content creator, Public figure, Travel blogger) and UAE/GCC **#1 of 5** (HUDA BEAUTY, trending.vibz.uae, the.matis, ola.alqodmani); `natgeo` peer and regional rankings **#4 of 4** with only News & media peers (khaleejtimes, timeoutdubai, gulfnews); `emirates` only Travel & tourism peers; `dubaimall` only a Business & brand peer. Demo exactness intact (1.63% / 25.00% / 96.50%, zero `Est.` badges) |
| Four-factor homepage ranking + country boards + rate limit hardening | Local gates + Vercel Production `GET /` after deploys `2900248`, `4b76b83`, `dc0fbe3`, `f01e604` (2026-11-22) | 104 tests (incl. `leaderboard.test.ts` four-factor/ranking/region/batch cases and `tracked-store.test.ts` signature/TTL cases), typecheck, eslint, build pass. `GlobalPulse.tsx` now renders the original **Trending** and **High engagement** worldwide cards plus four new `region-boards` cards: `region-usa-list`, `region-europe-list`, `region-middle-east-list`, `region-uae-list` (top 10 each). Trending and country boards use `rankScore()` = followers 55% + engagement rate 20% + avg interactions 15% + 30-day follower change 10%, with fixed 0-100 normalisation anchors; High engagement stays ER-only because of its name. `src/core/data/regions.ts` curates one region per handle (Instagram publishes no account country), with UAE separate from the rest of the Middle East; the homepage discloses this. Pool grew 37→55 real handles (verified via production profile pages; suspicious tiny-follower copycats excluded). Snapshot carries a handle-list signature so changes invalidate stale data. Verified after the first deploy: Trending top `billieeilish` (score 88) with million-follower accounts ranked above small viral ones, USA 10, Europe 10, UAE 10, Middle East 5 (`qatarairways`, `aljazeera`, `alarabiya`, `visitqatar`, `asharqnews`). Expanding the pool triggered Meta `code 4` rate limits (confirmed in Vercel logs) and the old code cached the partial snapshot for 30 min, so refreshes were reworked: each 15-min refresh now merges at most 10 handles (missing first, then rotating), the snapshot accumulates for 6h, and ≥20% skips back off the in-memory cache to 10 min instead of hammering Meta. Deploys verified healthy (200, no bridge-offline copy). After Meta's cooldown the paced refreshes fully self-healed the snapshot: final production `GET /` shows `trending-list` 10 plus USA 10, Europe 10, Middle East 10 and UAE 10, with rank scores (88/80/78/78/77) on trending, the four-factor and country-disclosure copy present, and demo `nora.style` still exact (1.63% / 25.00% / 96.50%, zero Est.) |
| UAE headline + original tab icon | Local gates + Vercel Production `GET /` after deploy `d81a19f` (2026-11-22) | 104 tests, typecheck, eslint, build pass; `/icon.svg` emitted as a static route. Production HTML `<h1>` is now the full "Leading Instagram analytics platform in the UAE — performance-driven tools and a practical growth plan" with classes `text-3xl ... md:text-4xl` (previous small pill removed), followed by the lookup subline. `<head>` contains `<link rel="icon" href="/icon.svg?...svg" sizes="any" type="image/svg+xml"/>` from the original indigo ascending-bars design in `src/app/icon.svg` — no external asset or paid tool |
| Country-aware four-factor peers + wider Middle East coverage | Local gates + Vercel Production `GET /`, `/profile/nora.style`, `/profile/natgeo`, `/profile/emirates`, `/compare?handles=hudabeauty` after commit `ecb78a3` / deploy `dpl_G1onjFF8nyoqXeKGwCRS9GZRVdyf` (2026-11-22) | 118 tests (new `rank.test.ts`, `country.test.ts`; updated `leaderboard`, `peer`, `regional`), typecheck, eslint, build pass. Shared `src/core/analytics/rank.ts` now drives homepage boards, peer rankings, UAE/GCC top 10 and compare suggestions with followers 55% + engagement 20% + avg interactions 15% + follower change 10%; `compareRank()` breaks ties by followers. `country.ts` prefers handle metadata/text, then profile text, then hashtags/captions, treats UAE as same macro-region as the rest of the Middle East, and still labels country as inferred because Instagram publishes no account location. Middle East board now covers Qatar, Saudi Arabia, Jordan, Egypt, Kuwait, UAE, Syria, Lebanon, Iraq, Palestine, Bahrain, Oman, Tunisia and Morocco, with UAE accounts included there and still highlighted on their own board; tracked pool grew 55→65 real handles under signature `v5`. Production HTML has one each of `trending-list`, `region-usa-list`, `region-europe-list`, `region-middle-east-list`, `region-uae-list`; Middle East top 10 at verification: `hudabeauty`, `emirates`, `burjkhalifa`, `qatarairways`, `aljazeera`, `the.matis`, `dubaimall`, `khaleejtimes`, `visitlebanon`, `timeoutdubai`, with smaller new country accounts entering as the paced 10-handle refreshes accumulate (snapshot reached 62 profiles; 3 skipped attempts correctly backed off to the 10-minute retry). Hero `<h1>` classes are now `text-2xl ... md:text-3xl` with the full UAE positioning copy. `/profile/nora.style` keeps exact demo values **1.63% / 25.00% / 96.50%** and no Est. badge; `/profile/natgeo` and `/profile/emirates` show `Rank #... among comparable profiles`, the four weights, avg interactions/follower-change rows, Est. disclosure and country-inferred disclosure; `/compare?handles=hudabeauty` suggests same-country UAE peers (`the.matis`, `trending.vibz.uae`, `ola.alqodmani`) with reasons, four-factor fit and Add links. No code changed after this deployment; this row is docs-only |
| Verified badge, in-range benchmarks, five-profile rank, avatar, four-factor High engagement | Local gates + Vercel Production `GET /`, `/profile/{natgeo,hudabeauty,nora.style,emirates,dubaimall}`, `/compare?handles=hudabeauty` after deploys `dpl_GZgGCwW4ctQc5oMngDv7vnEQpeiR`, `dpl_EMZjmHAW5KzaqRTUmxQqaGx4fH76`, `dpl_Abwb7uXCcTgaJ2rTSrU5QcMA4m6S` (2026-11-22) | 129 tests, typecheck, eslint, build pass. Live `business_discovery` cannot return `is_verified`; `fetchPublicIdentity()` now reads the signed public HTML profile page (30-min cache, best effort) and `adapter.ts` applies the fresh badge, while `VERIFIED_HANDLES` in `src/core/data/verified.ts` holds a real 2026-11-22 snapshot (64 tracked handles read from public HTML through the proxy) as the offline fallback used by `mapProfile()`. `profile-avatar` renders the real picture via `next/image` with an initials fallback (Instagram CDN hosts allow-listed in `next.config.ts`). `isComparableRange()` gates only benchmark suggestions to within 3x followers and ~2x/0.5 pt engagement; ranking tables opt out via `{ requireComparableRange: false }` so `buildPeerRanking()` always shows the searched profile plus four peers (five rows), filling spare rows from the next country tiers while keeping the category gate, and the UAE/GCC table stays populated. Match reasons include "similar audience size and engagement range". Both rank captions say "of N profiles". `engaged` sorts by the shared four-factor `rankScore` like every other board; the long curated-pool paragraph was removed from the homepage. Final production checks: `/profile/natgeo` shows the emerald **Verified** badge (Bridge-offline log still shows "public lookup bridge is offline", so the real snapshot fallback is what works), a real `scontent-*.fbcdn.net` avatar via `next/image`, and **Rank #1 of 5 profiles**; `hudabeauty` **#1 of 5**, `nora.style` **#4 of 5**, `emirates` **#1 of 5**; `dubaimall` is **#2 of 3** because only two real Business & brand accounts are in the live snapshot. `/compare?handles=hudabeauty` suggestions show "similar audience size and engagement range". Homepage has one each of `trending-list`, `engagement-list`, `region-usa-list`, `region-europe-list`, `region-middle-east-list`, `region-uae-list`; High engagement and all country boards show descending rank scores (e.g. Zendaya 90, Billie Eilish 88, Virat Kohli 87), the removed paragraph is absent (0 matches), hero copy and original `/icon.svg` are intact. `nora.style` still shows exact **1.63% / 25.00% / 96.50%** with zero `Est.` badges. Details in `README.md` |
| Same-country/region compare rank | Local gates + Vercel Production `GET /compare?handles={hudabeauty,ola.alqodmani,hudabeauty,ola.alqodmani}` after commits `ada2b79`, `32215cf` / deploys `dpl_3a5LRhSwn3Cv94Foxmh2sPRsg2yk`, `dpl_7PmWqTbvnRKycyAUFxGKRHUmJxiY` (2026-11-22) | 132 tests (new `compare.test.ts`), typecheck, eslint, build pass. New `compare-rank` section ranks other real public profiles from the first compared account's inferred country first, then the same wider region, using the shared `rankScore()` (followers 55%, engagement 20%, avg interactions 15%, follower change 10%) with the category gate intact. Every compared handle (plus missing handles) is excluded from both the rank table and the remaining `compare-suggestions`. Production: `/compare?handles=hudabeauty` shows `the.matis` (53.1), `trending.vibz.uae` (46.6), `ola.alqodmani` (37.2) as same-country rows, then `aljazeera` (57.1) as same-region; `/compare?handles=ola.alqodmani` shows `hudabeauty` (66.8), `the.matis` (53.1), `trending.vibz.uae` (46.6) and no repeated suggestion section. With `hudabeauty,ola.alqodmani` both accounts are absent from `compare-rank`, proving already-compared handles are excluded. Country labels remain disclosed as inferred, and demo exactness is untouched |
| Country boards sorted by follower count | Local gates + Vercel Production `GET /` after commit `32d19d4` / deploy `dpl_72zmV1sLb3oLPf5iqjFZm61shaT2` (2026-11-22) | 133 tests (updated `leaderboard.test.ts` with a small high-engagement vs larger low-engagement inversion case), typecheck, eslint, build pass. `regionalBoards()` now uses `byFollowersFirst()`: follower count descending is the primary key, `rankScore()` only breaks ties. Worldwide Trending/High engagement keep the weighted four-factor order. Card subtitles disclose the followers-first country order. Production UAE top ten is now `hudabeauty` 56.2M, `emirates` 9.1M, `burjkhalifa` 2.3M, `khaleejtimes` 1.4M, `dubaimall` 1.4M, `gulfnews` 1.4M, `timeoutdubai` 1.4M, `the.matis` 1.1M, `flydubai` 387.6K, `jumeirah` 267.2K — `trending.vibz.uae` (58.9K) is no longer in the board. Middle East top ten leads `hudabeauty` 56.2M, `aljazeera` 15M, `qatarairways` 9.2M, `emirates` 9.1M, `alarabiya` 8M, `asharqnews` 2.5M, `burjkhalifa` 2.3M, `khaleejtimes` 1.4M, `dubaimall` 1.4M, `gulfnews` 1.4M; small `visitlebanon` no longer takes a slot |
| No repeated Ola/trending profile benchmarks | Local gates + Vercel Production `GET /profile/{hudabeauty,nora.style,qatar,the.matis}` after commit `f2f3745` / deploy `dpl_6zfHw9YG8kRVhZ9sbzrj87V88v4V` (2026-11-22) | 137 tests (new `exclusive.test.ts`), typecheck, eslint, build pass. `dedupeProfileBenchmarks()` in `src/core/analytics/exclusive.ts` treats `ola.alqodmani` and `trending.vibz.uae` as a mutually exclusive curated group and keeps only the better-scoring member across the closest-peer card, peer ranking, regional peer card and regional ranking; ranks/totals are recomputed after removal. Production pages that previously had both now show `ola.alqodmani` **0 times** and keep only `trending.vibz.uae`; `hudabeauty` peer rank tightened from 5 to **4 profiles**, regional rank from 4 to **3 UAE/GCC profiles**, and `nora.style` regional rank from 5 to **4 UAE/GCC profiles** |
| Middle East ±30% post-activity profile benchmark | Local gates + Vercel Production `GET /profile/{amrmaskoun,qatarairways,hudabeauty,nora.style,the.matis}` after commits `faafd34`, `03db773` / deploys `dpl_9px4S5fvXySJu4zGbpMs39xRWfML`, `dpl_CdFTGVEesXd5HnVCF6Wfi3CSDpo7` (2026-11-22) | 133 tests (rewritten `regional.test.ts`: Middle East pool, ±30% boundaries, post-only activity, four-factor ordering, concise visible reasons; updated `category.test.ts` and `exclusive.test.ts`), typecheck, eslint, build pass. `getRegionalProfiles()` uses `isInRegionBoard(username, "middle-east")`; `isWithinFollowerLatency()` hard-gates both the peer card and rank table to 70–130% of the searched profile; `inferPostActivity()` reads only Reel/post captions and hashtags, never name/bio/claimed category; every visible row uses the unchanged `rankScore()` weights. The panel copy was simplified at `03db773`: no ±30% band, no post-only inference explanation, no weight breakdown, no band badge, no inferred-country note and no technical empty-state detail inside `regional-benchmark`. Production `/profile/amrmaskoun` now shows only the heading and a short no-profile/no-ranking empty state, with zero `UAE/GCC` copy; the closest tracked accounts `alarabiya` 8M and `asharqnews` 2.5M remain outside the enforced 4.1M–7.6M band. `/profile/qatarairways` still ranks `emirates` 9.1M #1, the profile #2 and `alarabiya` 8M #3 by rank score, with `aljazeera` 15M excluded; its visible reasons are now short (`shared activity`, inferred country, `four-factor fit`). Exclusivity still holds: `hudabeauty`, `nora.style` and `the.matis` show `ola.alqodmani` 0 times and keep only `trending.vibz.uae` |
| Real verified badge + explicit-label creator benchmarks | Local gates + Vercel Production `GET /profile/rim.official__`, `/profile/nora.style`, `/profile/cristiano`, `/` after commits `477c5f3`, `fd675b1`, `d5fc94d` / deploys `dpl_FVrjPkmUwe5rpmvYh7XtqNBuA8jx`, `dpl_9oRHe2rDe3n74knXAfFyyWdCk9NX`, `dpl_6EpnXYbjwUbHreHsTXX2J1eCVjcx` (2026-11-23) | 143 tests (new `rank`/`regional`/`category`/`peer`/`live` regressions), typecheck, eslint, build pass. `rim.official__` added to the real `VERIFIED_HANDLES` snapshot (public creator directory sourced from Instagram), with fresh `fetchPublicIdentity()` still taking precedence. `regionalRankScore()` adds a disclosed 90% four-factor + 10% authenticity term only to the Middle East panel; global boards and compare ranks stay four-factor. Regional and global category gates now require explicit public name/bio labels when the searched profile has one, so fallback `Digital creator` guesses such as `@qatar` and business/travel accounts such as `@jumeirah` are no longer creator peers; post activity is supporting evidence only. Final production: `/profile/rim.official__` shows **Verified**, `293.3K` followers, `99.7K est.` fake followers, global peer rows from labeled beauty/creator accounts, an honest "No comparable Middle East profile / No Middle East ranking" empty state, and zero `qatar`/`jumeirah` text. `/profile/nora.style` keeps exact demo values **1.63% / 25.00% / 96.50%** with no `Est.` badge; `/profile/cristiano` still renders real live values with modeled estimates clearly labelled (live count drifted to 680.4M / 1.51% / Est. 98.00%); homepage still has all six boards and the compact UAE hero. |
| Five-profile Middle East rank with real public peers | Local gates + Vercel Production `GET /profile/rim.official__`, `/profile/nora.style`, `/` after commit `331a76b` / deploy `dpl_EkRaMMcQBxZjHP3hahnPonATwnJE` (2026-11-23) | 144 tests (updated `regional.test.ts` for the new five-row default and explicit top-10; `leaderboard.test.ts` for new region membership), typecheck, eslint, build pass. Added six real, publicly discoverable Business/Creator accounts in `@rim.official__`'s ±30% follower band — `alisha_sajjal` 298.4K UAE/Beauty, `alitofique` 300.1K UAE/Blogger, `hinaashh` 300.2K UAE/Digital creator, `jexmi` 327K UAE/Blogger, `najet.dh` 299.4K Middle East/Beauty, `elsakahwaji` 250.9K Lebanon/Fashion model — to the curated tracked pool, with curated country/region metadata. `buildRegionalRanking()` now defaults to four peers plus the searched profile, so the panel shows exactly five rows; no gate was relaxed and post activity remains supporting evidence only. Production: `/profile/rim.official__` is still **Verified**, has zero `qatar`/`jumeirah` text, and shows **Rank #5 of 5 Middle East profiles** with real peers `jexmi`, `alitofique`, `elsakahwaji` and `alisha_sajjal`. `/profile/nora.style` keeps exact demo values **1.63% / 25.00% / 96.50%** with zero `Est.`; all six homepage boards remain present |
| Five Middle East rows for every UAE creator + pre-ranking exclusivity | Local gates + Vercel Production `GET /profile/{ola.alqodmani,trending.vibz.uae,nora.style}` after commits `c5a2f94`, `1fb6493` / deploys `dpl_8rBwqFpArx4Y9vLcYJLJ9wcgkxkS`, `dpl_3WXhc3KZGT5sXrLvzkoGmq123kEX` (2026-11-23) | 148 tests (new `regional`/`exclusive` regressions for exact-label preference, exclusivity and five-row backfill), typecheck, eslint, build pass. Added eight real, publicly verified explicitly labeled UAE creators in the 46–72K band — `donya_esmailiii`, `aiamwa`, `dina_h_ussien`, `poojaabis`, `taranum_sshahin`, `dina.ak`, `anshi_pandyala_official`, `zeniamk` — to the tracked pool, region and country metadata. `rankedCandidates()` now prefers an exact explicit category label over another creator-group label and reports `same category label` vs `same creator category group` honestly. Exclusive peers are removed from the tracked/regional candidate pools **before** rankings are built, so the fifth row is backfilled instead of being lost after filtering. Production: `/profile/ola.alqodmani` and `/profile/trending.vibz.uae` both show **Rank #5 of 5 Middle East profiles**, each with zero mentions of the other exclusive handle; `/profile/nora.style` still shows exact **1.63% / 25.00% / 96.50%** with zero `Est.` |
| Split average likes/comments + removed Modash badge note | Local gates + Vercel Production `GET /`, `/profile/{nora.style,ola.alqodmani,trending.vibz.uae}`, `/compare?handles=hudabeauty,nora.style` after commit `96e731f` / deploy `dpl_DTyLYTxdDUYGP1DrZt7wGumxFkVH` (2026-11-23) | 149 tests, typecheck, eslint, build pass. `RANK_WEIGHTS` is now followers 55%, engagement 20%, avg likes 10%, avg comments 5%, follower change 10%; `rankScore()` uses 2M-like and 200K-comment log ceilings, and `rankFactorSimilarity()` scores likes/comments separately. Profile metric cards, peer/regional/compare rows, global pulse metadata and Middle East key comparisons now show **Avg likes** and **Avg comments** instead of combined interactions; private/no-post cards stay `—`. The Engagement rate hint no longer appends `Modash engagement benchmarks: ...`. Production has zero `Avg interactions`, `avg interactions` or `Modash engagement benchmarks` on all checked pages; `/profile/nora.style` keeps exact **1.63% / 25.00% / 96.50%** with zero `Est.`, and `/profile/ola.alqodmani` and `/profile/trending.vibz.uae` each remain **Rank #5 of 5 Middle East profiles** with zero mentions of the other exclusive handle |
| Public comparison with estimates | `GET /compare?handles=trending.vibz.uae,nora.style` | **200**, public + demo rows, `5.9K est.`, `-3.47% est.`, `90.00% est.`, `High confidence`, `Demo fixture`, `Estimate basis` |
| Public PDF with estimates | `GET /api/report?handles=trending.vibz.uae,nora.style` | **200**, `application/pdf`, **2,431 bytes**, expected filename; builder emits per-profile confidence and footer disclaimer |
| Unknown public handle | `GET /profile/nope.9988.xyz` | **200**, “Profile not found”, public message; only global “No API keys required” sidebar copy |
| Demo profile isolation | `GET /profile/nora.style` | **200**, `1.63%`, `25.00%`, `96.50%`, no `Est.` badge or estimate panel |
| PDF error path | `GET /api/report?handles=ghost.account` | **400**, `Unavailable handle(s)` |
| Estimate units | `tests/estimates.test.ts` | strong/weak signal scoring, confidence levels, bounds, disclosure fields, private/empty/zero-follower guards, demo isolation |
| Public reader units | mocked profile + embed HTML | mapping, pk helpers, cache, pinned skip, partial embed, private, 404, 200 shell, 429, API fallback, `web_profile_info` fallback with inline engagement, gated no-post profile |
| Proxy bridge units | `tests/public.test.ts` with mocked `fetch` | all three request types routed through `INSTAGRAM_PROXY_URL` with `Bearer` secret; direct fallback on proxy 5xx; empty-shell/404 retry; no secret in logs |
| Proxy health marker | `tests/proxy.test.ts`, `tests/public.test.ts` | every proxy response carries `X-Instagram-Proxy: ok`; any marker-less proxy response (404 or 502 from tunnel/CDN) is reported as `error` / “The public lookup bridge is offline”, while a marked 404 still means a genuinely missing handle |
| Proxy endpoint units | `tests/proxy.test.ts` | 503 without secret, 401 on wrong secret, 400 on non-Instagram or unexpected paths, crawler user agent, `x-ig-app-id` for `web_profile_info` |
| Weekly digest units | `tests/digest.test.ts` | email/handle normalization, invalid values, consent, honeypot, 30-day trial end, display-only trial, estimated-growth label, week-over-week follower/engagement deltas, unsubscribe token, HTML escaping, profile URL |
| Weekly digest config guards | code review | `/api/digest/send` returns 503 without `CRON_SECRET`, Resend, or Upstash config; signup route stores only after validation and never logs email addresses |
| Vercel rate-limit diagnosis | `GET /profile/natgeo` on `https://www.instagram-analytics.com` | **200 HTML** with “Instagram is temporarily limiting public lookups”; datacenter egress gets 429 while local home IP works |
| Gated public handle (real) | `GET /profile/the.matis` | **200**, 1M followers / 1,314 following / 1,546 posts from Open Graph; `no-posts-notice` shown, engagement `—`, no false `0.00%` |
| Official API adapter | mocked `fetch` | URL, bearer header, mapping, `190`, `100`, public fallback all pass |
| Public PDF safety | emoji/Arabic name + no audience | valid `%PDF-` document |
| Code hygiene | grep | no `TODO`/`FIXME`/`PLACEHOLDER`, no `await log.`, no `console.log`/`debugger` |

---

## Deferred — out of v1.5 by explicit user decision (not orphans)

- Audience demographics, saves, reach, and follower history for public accounts — unavailable from public pages and Business Discovery.
- Keyword / creator discovery search — not offered by Instagram's public pages or API.
- Authenticated account insights, saved lists, client-branded reports, billing.
- Marketplace, campaigns, chat, escrow/payments (Modash/Collabstr scope deliberately excluded).
- Arabic RTL / bilingual toggle, Playwright E2E suite.
- Paid scraping providers — rejected; the local proxy bridge has no per-request cost.
