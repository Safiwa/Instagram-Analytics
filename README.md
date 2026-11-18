# Signal — Instagram Profile Analytics

Professional Instagram profile analysis, side-by-side comparison, and PDF reports.
Built with Next.js 16, React 19, Tailwind CSS 4, Recharts, and `pdf-lib`.

Username lookup works **without Meta keys or a Meta app**. Enter any public Instagram
handle and the app reads the server-rendered public profile page and public post
embeds. Eight local demo profiles stay available for offline testing.

## Quick start

```powershell
npm install
npm run dev
```

Open <http://localhost:3000> and enter a public username such as `trending.vibz.uae`.

## Routes

| Route | Purpose |
|---|---|
| `/` | Public handle lookup, demo directory, and demo filter |
| `/profile/[username]` | KPIs, interactions, recent posts, and public-data notices |
| `/compare?handles=a,b,c,d` | Side-by-side comparison, maximum four accounts |
| `/api/report?handles=a,b` | Downloadable PDF report |

## How public lookup works

1. `GET https://www.instagram.com/{username}/` with a crawler user agent that
   receives server-rendered HTML.
2. Parse the embedded JSON payload for name, bio, verification, privacy, follower
   count, following count, and up to 12 recent media nodes.
3. Read total posts from the page's Open Graph description.
4. Derive each post's shortcode and timestamp from its numeric media id.
5. Fetch `https://www.instagram.com/p/{shortcode}/embed/captioned/` for public
   likes, comments, and video views, four at a time.
6. Cache successful profiles in memory for 5 minutes (maximum 100 entries).

Seeded demo handles are served from local fixtures first, so they never make a
network call.

### What public lookup can show

- Display name, username, bio, verification badge, profile picture URL
- Followers, following, total post count
- Up to 12 recent, non-pinned posts with likes, comments, type, date, caption,
  hashtags, permalink, and video views

### What it cannot show

These are not published on public profile pages, so they render as `N/A` or `—`:

- Saves and reach per post
- Audience demographics (countries, age, gender)
- Historical follower counts and 12-month growth
- Fake-follower / authenticity estimates
- Stories, highlights, and private-account media

Other limits:

- The account must be **public**; private accounts return counts only.
- Facebook/Meta does not expose global keyword or creator search through public pages.
- Public pages can rate-limit or change shape; the app reports a clear retryable
  message instead of crashing.
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
│  ├─ analytics/metrics.ts      # shared engagement/growth/authenticity math
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
└─ tests/                       # Vitest: adapter, metrics, report, logger, live, public
```

See `PROJECT_MAP.md` for architecture decisions, limitations, and the verification log.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| “No public Instagram profile found” | Handle is misspelled, deleted, or not public | Check the spelling; private accounts show counts only |
| “Instagram is temporarily limiting public lookups” | Public page rate limit | Wait a few minutes and retry |
| “Instagram returned a page that could not be read” | Page shape changed or a login wall appeared | Retry; if it persists, the public page markup changed |
| Public rows show `N/A` | Expected public-data limitation | Saves, audience, growth, and authenticity require account-owner insights |
| Official API says “token invalid” | Meta code `190` | Public lookup still works; refresh the token only if you want the optional path |

## Security

- `.env.local` is never committed; only `.env.example` is tracked.
- When the optional official API is enabled, tokens are sent in the `Authorization`
  header and are never logged.
- Logs include handles and error codes, never token values.
- Public responses are cached in process memory only; nothing is persisted.
