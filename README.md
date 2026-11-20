# Instagram Analytics — Instagram Profile Analytics

Professional Instagram profile analysis, side-by-side comparison, and PDF reports.
Built with Next.js 16, React 19, Tailwind CSS 4, Recharts, and `pdf-lib`.

Username lookup works **without Meta keys, paid APIs, or credits**. Enter any public
Instagram handle and the app reads the server-rendered public profile page and public
post embeds. Local lookups work directly. Vercel functions are rate-limited by
Instagram, so the deployed site sends those requests through a secure endpoint on your
own computer via a free Cloudflare Tunnel; the data then comes from your home IP and
matches `localhost`. The home page is an analysis dashboard that explains the pipeline,
metric engine, data sources, and confidence levels. Eight demo profiles remain
available by direct URL for offline testing. Public accounts with visible posts also
get clearly labeled fake-follower, authenticity, and 12-month-growth estimates derived
from public signals. The home page also offers a free 30-day weekly digest: subscribers
get a Monday email with the current engagement rate and follower growth for one handle.

## Quick start

```powershell
npm install
npm run dev
```

Open <http://localhost:3000> and enter a public username such as `trending.vibz.uae`.

## Deploying to Vercel with a free local proxy bridge

Vercel functions run on cloud IPs that Instagram rate-limits with HTTP 429. This app
sends Instagram requests from your own computer instead, through a free Cloudflare
Tunnel. No paid API, scraping credits, or Meta app is involved. Your computer must stay
on and connected.

### 1. Create a shared secret

Generate a long random value locally, for example in PowerShell:

```powershell
-join ((48..57 + 65..90 + 97..122) | Get-Random -Count 40)
```

**Never paste this value into chat or commit it.**

### 2. Configure the local machine

Create `.env.local` in the project root:

```text
PROXY_SECRET=<the same secret from step 1>
```

Build and start the local server that the tunnel will target:

```powershell
npm install
npm run build
npm run start
```

Keep it running on `http://localhost:3000`.

### 3. Create the Cloudflare Tunnel

You need a domain added to Cloudflare. Install `cloudflared`, then run:

```powershell
winget install --id Cloudflare.cloudflared
cloudflared tunnel login
cloudflared tunnel create trending-analytics-proxy
cloudflared tunnel route dns trending-analytics-proxy analytics-proxy.instagram-analytics.com
```

Create `%USERPROFILE%\.cloudflared\config.yml`:

```yaml
tunnel: <TUNNEL_ID_FROM_PREVIOUS_COMMAND>
credentials-file: C:\Users\<YOU>\.cloudflared\<TUNNEL_ID_FROM_PREVIOUS_COMMAND>.json
ingress:
  - hostname: analytics-proxy.instagram-analytics.com
    service: http://localhost:3000
  - service: http_status:404
```

Run and install it as a Windows service so it starts automatically:

```powershell
cloudflared tunnel --config C:\Users\<YOU>\.cloudflared\config.yml run trending-analytics-proxy
cloudflared service install
```

On Windows the service runs as `LocalSystem` and looks for its config under
`C:\Windows\System32\config\systemprofile\.cloudflared`. Copy `config.yml` and the
tunnel JSON credential there if the service does not register a connection.

### 4. Configure Vercel

In **Project → Settings → Environment Variables**, add:

| Name | Value |
|---|---|
| `INSTAGRAM_PROXY_URL` | `https://analytics-proxy.instagram-analytics.com/api/instagram-proxy` |
| `PROXY_SECRET` | the same secret from step 1 |

Delete `SCRAPINGBEE_API_KEY` if it still exists. Redeploy, then test
`https://www.instagram-analytics.com/profile/natgeo`.

The proxy endpoint allowlists only public Instagram profile, `web_profile_info`, and
post-embed URLs, and rejects every request without the shared secret. Profiles are
cached in the Vercel function for 5 minutes, so one lookup typically uses one tunnel
request plus a few embed requests.

## Routes

| Route | Purpose |
|---|---|
| `/` | Public handle lookup and an analysis dashboard: pipeline, metric engine, sources, confidence |
| `/profile/[username]` | KPIs, estimate disclosure, interactions, recent posts, and public-data notices |
| `/compare?handles=a,b,c,d` | Side-by-side comparison, maximum four accounts |
| `/api/report?handles=a,b` | Downloadable PDF report |
| `/api/digest/subscribe` | Validates and stores a weekly-digest signup |
| `/api/digest/send` | Cron-only weekly digest sender |
| `/api/digest/unsubscribe` | Signed one-click unsubscribe link |

## Weekly digest (free 30-day trial)

The home page has a signup form for a Monday email containing the current engagement
rate, the week-over-week follower and engagement change, and 12-month follower growth
for one Instagram handle. Signups are idempotent per email + handle pair, require
explicit consent, and include a honeypot field. The free trial ends 30 days after
signup; no card is required and emails stop automatically at the end of the trial.

For local development, signups are stored in `.data/digest-subscriptions.json`. On
Vercel, set these variables:

| Variable | Purpose |
|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | SMTP account used to send the digest. `SMTP_FROM` defaults to `SMTP_USER`. |
| `SMTP_SECURE` | Set `true` for implicit TLS; port `465` enables it automatically. |
| `CRON_SECRET` | Shared secret for the Vercel Cron request and for signing unsubscribe links. |
| `DIGEST_WORKER_URL`, `DIGEST_WORKER_SECRET` | Authenticated Cloudflare Worker that stores signups in a free KV namespace. |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `DIGEST_KV_NAMESPACE_ID` | Optional direct Cloudflare KV REST fallback if the Worker is unavailable. |

`vercel.json` schedules `/api/digest/send` at 08:00 UTC every Monday. The sender reads
due subscriptions, reuses one profile resolution per handle, sends through SMTP, and
stores the current follower count and engagement rate for next week's comparison.
Follower growth is labeled `Est.` when it is modeled. Each email includes a signed
unsubscribe link. No email is sent if SMTP or `CRON_SECRET` is missing; the endpoint
returns a clear configuration error instead of pretending to send.

## How public lookup works

1. `GET https://www.instagram.com/{username}/` with a crawler user agent that
   receives server-rendered HTML. On Vercel, when `INSTAGRAM_PROXY_URL` is set, the
   request goes to the authenticated local proxy endpoint and is fetched from your
   home IP; direct fetch is the fallback. A transient 404, 429, or metadata-free page
   is retried once before a handle is reported as missing.
2. Parse the embedded JSON payload for name, bio, verification, privacy, follower
   count, following count, and up to 12 recent media nodes.
3. If Instagram serves no preloaded posts, try the public `web_profile_info`
   endpoint as a second source. It also carries inline likes/comments/views, so
   no embed requests are needed when it succeeds.
4. Read total posts from the page's Open Graph description.
5. Derive each post's shortcode and timestamp from its numeric media id when the
   source does not provide them directly.
6. Fetch `https://www.instagram.com/p/{shortcode}/embed/captioned/` for public
   likes, comments, and video views, four at a time, only when they are missing.
   The local proxy sends the required `x-ig-app-id` header for `web_profile_info`
   and a crawler user agent for HTML pages.
7. Cache successful profiles in memory for 5 minutes (maximum 100 entries).

Seeded demo handles are served from local fixtures first, so they never make a
network call.

### What public lookup can show

- Display name, username, bio, verification badge, profile picture URL
- Followers, following, total post count
- Up to 12 recent, non-pinned posts with likes, comments, type, date, caption,
  hashtags, permalink, and video views
- Modeled fake-follower count, authenticity, and 12-month growth for accounts with
  visible posts, labeled `Est.` in the UI and report

### What it cannot show

These are not published on public profile pages, so they render as `N/A` or `—`:

- Saves and reach per post
- Audience demographics (countries, age, gender)
- Measured historical follower counts (the 12-month growth figure is modeled)
- Stories, highlights, and private-account media

## Estimated metrics

Instagram does not publish fake-follower counts or historical follower counts. For
public and optional-API profiles with at least one visible post, Instagram Analytics computes:

| Metric | How it is produced |
|---|---|
| Fake followers | A bounded model using follower/following balance, engagement versus account-size benchmarks, comment-to-like ratio, engagement stability, verification, follower tier, and posting history. |
| Authenticity | `100 - modeled fake-follower share`. |
| 12-month growth | A modeled direction and range from engagement strength, authenticity, posting cadence, public reach proxy, engagement trend, and account size. |

These values are **estimates, not Instagram measurements**. The profile page shows an
`Est.` badge, a confidence level (Low / Medium / High), the methodology, and the public
signals used. Private accounts, accounts with no visible posts, and zero-follower
accounts show `—`. Seeded demo profiles keep their exact fixture values and are never
modeled.

Other limits:

- The account must be **public**; private accounts return counts only.
- Facebook/Meta does not expose global keyword or creator search through public pages.
- Public pages can rate-limit or change shape. Instagram sometimes withholds all
  posts from logged-out pages; when both public sources return none, the profile
  shows an explicit “posts not exposed” notice and `—` instead of misleading zeros.
  Retry in a few minutes.
- Datacenter IPs (including Vercel functions) are refused by Instagram with HTTP 429.
  Configure the local proxy bridge described above for the public deployment; local
  lookups need no proxy.
- Embedded collab posts are counted on every profile where they appear.
- This is an unofficial reader of public pages, not the official Instagram API.

## Optional official API

If both variables below exist, the app tries Instagram Business Discovery first and
falls back to the public reader when that request fails. No credentials are needed
for normal use.

| Variable | Meaning |
|---|---|
| `IG_ACCESS_TOKEN` | Long-lived Facebook user access token for the account that manages the Page |
| `IG_BUSINESS_ACCOUNT_ID` | Instagram Business Account ID that performs the query (your own professional account, not the target) |
| `IG_GRAPH_VERSION` | Optional Graph API version, defaults to `v27.0` |

Copy `.env.example` to `.env.local` only when you want this path, then restart
`npm run dev`. Never commit `.env.local`.

The request shape is:

```text
GET https://graph.facebook.com/v27.0/{IG_BUSINESS_ACCOUNT_ID}
  ?fields=business_discovery.username(TARGET_USERNAME){
    id,username,name,biography,followers_count,follows_count,media_count,
    profile_picture_url,website,
    media.limit(12){id,caption,media_type,media_product_type,like_count,
    comments_count,timestamp,permalink,view_count}
  }
Authorization: Bearer {IG_ACCESS_TOKEN}
```

The token is sent as a header, never in the URL. Business Discovery still requires a
Professional target account and a Meta app with the relevant permissions; it is not
needed for the public reader.

## Scripts

```powershell
npm run dev        # development server
npm run build      # production build
npm run start      # production server
npm test           # Vitest suite
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint
```

## Project layout

```text
src/
├─ app/                         # routes: home, profile, compare, report API, local Instagram proxy
├─ components/                  # MetricCard, EmptyState
├─ core/
│  ├─ analytics/estimates.ts    # public-signal fake/authenticity/growth models
│  ├─ analytics/metrics.ts      # measured metrics + disclosed estimate fallback
│  ├─ data/adapter.ts           # demo, public, and optional official resolution
│  ├─ data/public.ts            # public-page reader, parsers, cache, errors
│  ├─ data/live.ts              # optional Business Discovery fetch, mapping, cache
│  ├─ data/seed.ts              # 8 demo profiles
│  ├─ format.ts                 # compact numbers, percentages, dates
│  └─ logging/logger.ts         # bounded async logger
├─ features/
│  ├─ discovery/HandleLookup.tsx
│  ├─ profile/ProfileDashboard.tsx
│  ├─ comparison/ComparisonTable.tsx
│  └─ report/reportDocument.ts  # pdf-lib builder
└─ tests/                       # Vitest: adapter, estimates, metrics, report, logger, live, public, proxy
```

See `PROJECT_MAP.md` for architecture decisions, limitations, and the verification log.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| “No public Instagram profile found” | Handle is misspelled, deleted, or not public | Check the spelling; private accounts show counts only |
| “Instagram is temporarily limiting public lookups” | Instagram refused the server IP, or the local proxy bridge is offline | Check that your PC, local server, and Cloudflare Tunnel are running; verify `INSTAGRAM_PROXY_URL` and `PROXY_SECRET` in Vercel |
| “Instagram returned a page that could not be read” | Page shape changed or a login wall appeared | Retry; if it persists, the public page markup changed |
| “Instagram did not expose this account's posts” | Logged-out pages hid every post and the fallback endpoint was blocked | Retry in a few minutes; followers/following/post counts are still public |
| Some public cells show `N/A` or `—` | Expected public-data limitation | Saves, audience, and measured history are unavailable; fake followers, authenticity, and growth appear as estimates only when posts are visible |
| Official API says “token invalid” | Meta code `190` | Public lookup still works; refresh the token only if you want the optional path |

## Security

- `.env.local` is never committed; only `.env.example` is tracked.
- `PROXY_SECRET` is shared only between Vercel and your local server. Set it in both
  environments; never commit or share it. The proxy endpoint rejects unauthenticated
  calls and non-Instagram targets.
- `INSTAGRAM_PROXY_URL` must be the Cloudflare Tunnel hostname for your local server.
- When the optional official API is enabled, tokens are sent in the `Authorization`
  header and are never logged.
- Logs include handles and error codes, never token values.
- Public responses are cached in process memory only; nothing is persisted.
