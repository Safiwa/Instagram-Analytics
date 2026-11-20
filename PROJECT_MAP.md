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
│  ├─ compare/page.tsx                   # async searchParams → resolveProfile → ComparisonTable
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
| Public home copy | `GET /` | **200**, no header source badge, weekly digest signup visible, “No API keys” lookup copy |
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
