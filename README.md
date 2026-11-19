# Trending Analytics — Instagram Profile Analytics

Professional Instagram profile analysis, side-by-side comparison, and PDF reports.
Built with Next.js 16, React 19, Tailwind CSS 4, Recharts, and `pdf-lib`.

Username lookup works **without Meta keys or a Meta app**. Enter any public Instagram
handle and the app reads the server-rendered public profile page and public post
embeds. On local machines this works directly. Cloud hosts such as Vercel use an
optional `SCRAPINGBEE_API_KEY` so requests come from a residential proxy instead of a
rate-limited datacenter IP. The home page is an analysis dashboard that explains the
pipeline, metric engine, data sources, and confidence levels. Eight demo profiles
remain available by direct URL for offline testing. Public accounts with visible posts
also get clearly labeled fake-follower, authenticity, and 12-month-growth estimates
derived from public signals.

## Quick start

```powershell
npm install
npm run dev
```

Open <http://localhost:3000> and enter a public username such as `trending.vibz.uae`.

## Deploying to Vercel

Vercel functions run on cloud IPs that Instagram rate-limits with HTTP 429, so a
keyless deployment will show “Instagram is temporarily limiting public lookups”. Add
one optional scraping key to make the public URL work:

1. Create a free account at <https://www.scrapingbee.com/> (1,000 credits, no card).
2. Copy the API key from the dashboard. **Do not paste it into chat or commit it.**
3. In Vercel: **Project → Settings → Environment Variables → Add New**, name it
   `SCRAPINGBEE_API_KEY`, paste the value, select Production/Preview/Development,
   and save.
4. **Deployments → Redeploy** (or push a commit).

The app then fetches Instagram through ScrapingBee premium proxies with JavaScript
rendering disabled (10 credits per request; 5-minute in-memory cache). Post-embed
top-ups are capped at 3 per profile while the key is active. Direct fetching remains
the fallback when the scraper is unavailable.

## Routes

| Route | Purpose |
|---|---|
| `/` | Public handle lookup and an analysis dashboard: pipeline, metric engine, sources, confidence |
| `/profile/[username]` | KPIs, estimate disclosure, interactions, recent posts, and public-data notices |
| `/compare?handles=a,b,c,d` | Side-by-side comparison, maximum four accounts |
| `/api/report?handles=a,b` | Downloadable PDF report |

## How public lookup works

1. `GET https://www.instagram.com/{username}/` with a crawler user agent that
   receives server-rendered HTML. When `SCRAPINGBEE_API_KEY` is set, the same URL is
   fetched through ScrapingBee's residential proxies first; direct fetch is the
   fallback. A transient 404, 429, or metadata-free page is retried once through a
   fresh proxy before a handle is reported as missing.
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
   With a scraping key configured, at most 3 embeds are fetched per profile.
   The `web_profile_info` request forwards `x-ig-app-id` through ScrapingBee so
   Instagram returns the post payload with inline engagement.
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
public and optional-API profiles with at least one visible post, Trending Analytics computes:

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
  Set `SCRAPINGBEE_API_KEY` on cloud deployments; local lookups need no key.
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
├─ app/                         # routes: home, profile, compare, report API
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
└─ tests/                       # Vitest: adapter, estimates, metrics, report, logger, live, public
```

See `PROJECT_MAP.md` for architecture decisions, limitations, and the verification log.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| “No public Instagram profile found” | Handle is misspelled, deleted, or not public | Check the spelling; private accounts show counts only |
| “Instagram is temporarily limiting public lookups” | Instagram refused the server IP (common on Vercel) | Add `SCRAPINGBEE_API_KEY` in Vercel and redeploy; otherwise wait a few minutes and retry |
| “Instagram returned a page that could not be read” | Page shape changed or a login wall appeared | Retry; if it persists, the public page markup changed |
| “Instagram did not expose this account's posts” | Logged-out pages hid every post and the fallback endpoint was blocked | Retry in a few minutes; followers/following/post counts are still public |
| Some public cells show `N/A` or `—` | Expected public-data limitation | Saves, audience, and measured history are unavailable; fake followers, authenticity, and growth appear as estimates only when posts are visible |
| Official API says “token invalid” | Meta code `190` | Public lookup still works; refresh the token only if you want the optional path |

## Security

- `.env.local` is never committed; only `.env.example` is tracked.
- `SCRAPINGBEE_API_KEY` is read only on the server and must be set in the hosting
  provider's environment-variable UI. Never commit or share the real key.
- When the optional official API is enabled, tokens are sent in the `Authorization`
  header and are never logged.
- Logs include handles and error codes, never token values.
- Public responses are cached in process memory only; nothing is persisted.
