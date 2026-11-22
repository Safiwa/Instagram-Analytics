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

### 2b. Auto-start the local app at logon

The tunnel forwards to `http://localhost:3000`, so the Next.js server must also be
running after a reboot. After `npm run build`, register a per-user Task Scheduler
task that starts the production server directly at logon:

```powershell
$project = (Get-Location).Path
$dir = "$env:LOCALAPPDATA\InstagramAnalytics"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

@'
Option Explicit
Dim shell, project, node, nextBin, command
Set shell = CreateObject("WScript.Shell")
project = "C:\Users\safiw\Downloads\Default Project"
node = "C:\Program Files\nodejs\node.exe"
nextBin = project & "\node_modules\next\dist\bin\next"
shell.CurrentDirectory = project
command = """" & node & """ """ & nextBin & """ start -H 127.0.0.1 -p 3000"
WScript.Quit shell.Run(command, 0, True)
'@ | Set-Content "$dir\app.vbs"

$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('//B "' + "$dir\app.vbs" + '"') -WorkingDirectory $project
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -DontStopOnIdleEnd -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'Instagram Analytics Dev Server' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force
```

The task runs `next start` through the hidden `wscript.exe` launcher, so the
`Running next.config.ts took ...` console window never appears when the watchdog
restarts it. It uses `next start`, not `next dev`, and restarts up to three times,
one minute apart, if the server exits. Make sure port 3000 is free before
registering it. Check or start it manually with:

```powershell
Get-ScheduledTask -TaskName 'Instagram Analytics Dev Server'
Start-ScheduledTask -TaskName 'Instagram Analytics Dev Server'
```

This starts the app only after you log in. The `cloudflared` service itself starts
before login, so a full recovery after reboot is: log in → app task starts → tunnel
service forwards to `localhost:3000`.

Because a console control event can still terminate the long-running task, also add a
one-minute watchdog that starts it again if port 3000 is not listening:

```powershell
$dir = "$env:LOCALAPPDATA\InstagramAnalytics"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
@'
$taskName = 'Instagram Analytics Dev Server'
if (-not (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)) {
  Start-ScheduledTask -TaskName $taskName
}
'@ | Set-Content "$dir\watchdog.ps1"

@'
Option Explicit
Dim shell, script, command
Set shell = CreateObject("WScript.Shell")
script = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\InstagramAnalytics\watchdog.ps1"
command = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & script & """"
WScript.Quit shell.Run(command, 0, True)
'@ | Set-Content "$dir\watchdog.vbs"

$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('//B "' + "$dir\watchdog.vbs" + '"')
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(10) -RepetitionInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -DontStopOnIdleEnd -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable
Register-ScheduledTask -TaskName 'Instagram Analytics Watchdog' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force
```

Do not create this task with `schtasks /Create`; its defaults add battery and idle
restrictions that make the watchdog skip runs. The `wscript.exe //B` + `shell.Run ..., 0, True`
wrapper keeps PowerShell fully hidden and waits for it to finish, so no command window
flashes every minute and Task Scheduler cannot cut off `Start-ScheduledTask`.
This keeps recovery under one minute even if the main task exits unexpectedly.

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
`C:\Windows\System32\config\systemprofile\.cloudflared`. Copy the tunnel JSON credential
there, write `config.yml` with a `credentials-file` path pointing to that same folder,
and set the service `ImagePath` so it loads the config and starts the tunnel:

```powershell
$dst = "C:\Windows\System32\config\systemprofile\.cloudflared"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item "$env:USERPROFILE\.cloudflared\<TUNNEL_ID>.json" "$dst\" -Force
Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Services\cloudflared' -Name ImagePath -Value '"C:\Program Files (x86)\cloudflared\cloudflared.exe" --config=C:\Windows\System32\config\systemprofile\.cloudflared\config.yml tunnel run'
Restart-Service cloudflared
```

Without the `--config` and `tunnel run` arguments the service exits with code `1067`.

Also make sure no Worker route such as `analytics-proxy.instagram-analytics.com/*`
still exists in Cloudflare. A Worker route takes precedence over the tunnel and can
send Instagram requests from Cloudflare egress, which Instagram rejects with HTTP 429.

### 3b. Test a VPS before migrating the proxy

The tunnel keeps lookups working while this PC is on, but it is not always-on. Before
moving the proxy to a VPS, prove that the VPS IP can read public Instagram data.
Instagram pre-flags datacenter ranges, so this test is a hard gate, not a formality.

On a fresh Ubuntu VPS (only TCP `22` open — do **not** open port `3000`), copy
`scripts/egress-test.sh` from this repo with `scp` (the repository is private, so a
`raw.githubusercontent.com` URL returns 404):

```powershell
scp "C:\Users\safiw\Downloads\Default Project\scripts\egress-test.sh" root@YOUR_VPS_IP:~/egress-test.sh
```

Then run it over SSH:

```bash
chmod +x egress-test.sh
./egress-test.sh
```

The script makes two requests with the exact headers from `src/core/data/public.ts`:
the server-rendered profile page (primary source) and `web_profile_info` (fallback).
It prints `PASS` (exit 0), `INCONCLUSIVE` (exit 2, try another known handle), or
`FAIL` (exit 1, login wall / 429 / challenge — delete the VPS). A 429 on
`web_profile_info` alone is informational; the profile page decides the verdict.

Do not re-run it more than once every few minutes from the same IP.

A low-cost option is Hetzner CPX02 (€5.49/mo in Helsinki, 1 vCPU / 1 GB RAM, hourly
billing, no commitment). It is too small to build the Next.js app, but it is enough
to run this test. If it passes, production needs a 4 GB plan such as CX23 or CPX22,
or the proxy logic must be extracted into a standalone Node service.

Observed on 2026-11-21: Hostinger KVM 1 (Brazil) failed this test on both its IPv6
address and its dedicated IPv4 — HTTP `429` with a final URL of
`https://www.instagram.com/accounts/login/`. That is Instagram's datacenter-IP
rejection, not a network fault. It confirms that swapping cloud providers does not
solve the egress problem; an always-on residential/mobile connection is required
for PC-independent lookups.

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
| `/` | Analysis dashboard: lookup, global pulse leaderboards (worldwide + USA/Europe/Middle East/UAE), pipeline, metric engine, Modash benchmark, sources, confidence |
| `/profile/[username]` | KPIs, 30-day growth analysis, category-matched peer and Middle East category benchmarks, estimate disclosure, interactions, recent posts, and public-data notices |
| `/compare?handles=a,b,c,d` | Side-by-side comparison (maximum four accounts) with a same-country/region weighted rank table and remaining comparable suggestions |
| `/api/report?handles=a,b` | Downloadable PDF report |
| `/api/digest/subscribe` | Validates and stores a weekly-digest signup |
| `/api/digest/send` | Cron-only weekly digest sender |
| `/api/digest/unsubscribe` | Signed one-click unsubscribe link |

## Global pulse leaderboards and benchmark

The home page renders six live leaderboards built from real public data returned by the official
Graph API path. Each entry links to a full profile analysis.

**Worldwide**

- **Trending · last 15 days** — accounts with a public post in the last 15 days.
- **High engagement** — engagement across up to 12 recent public posts ranked by the same five
  signals as every other board: followers first, then engagement rate, average likes, average
  comments and 30-day follower change.

**By country** (top 10 each, added alongside the worldwide cards)

- **USA · top 10**, **Europe · top 10**, **Middle East · top 10**, and **UAE · top 10**. The Middle
  East board covers Qatar, Saudi Arabia, Jordan, Egypt, Kuwait, UAE, Syria, Lebanon, Iraq, Palestine,
  Bahrain, Oman, Tunisia and Morocco; UAE accounts are also highlighted on their own board.

### Five-signal ranking

Trending and High engagement use one weighted rank score
(`rankScore()` in `src/core/analytics/rank.ts`, re-exported by `leaderboard.ts`) built from five
signals, in priority order:

1. **Followers** — 55%
2. **Engagement rate** — 20%
3. **Average likes** — 10%
4. **Average comments** — 5%
5. **30-day follower change** — 10%

Each signal is normalised to 0–100 against fixed anchors (followers: 200M ceiling; engagement: 5%
cap; average likes: 2M ceiling; average comments: 200K ceiling; follower change: −5% to +15%) so
scores stay stable across refreshes. Saves still count toward engagement rate, but the two
average-interaction weights use likes and comments separately. Followers carry the most weight, so
a large account is not outranked by a small one with exceptional engagement. Follower change is an
estimate for real accounts and is labelled `est.` in the UI. The same scoring module powers the
global boards, global peer rankings and the compare-page ranking, so those surfaces never disagree.
The Middle East profile panel starts from that score but adds a disclosed 10% authenticity term via
`regionalRankScore()` (90% weighted rank + 10% authenticity), so a lower modeled fake-follower share
ranks higher there. Global boards and compare ranks stay exactly five-signal.

The four **country boards** are strict top-ten lists by follower count: entries are sorted by
`followers` descending first, and the same `rankScore` only breaks ties. This keeps a small account
with one viral post from taking a UAE or Middle East top-ten slot from a materially larger account.
Their subtitles disclose the followers-first order.

Country is **curated, not inferred from Instagram demographics**: Instagram does not publish an
account's country, so `src/core/data/regions.ts` maps each tracked handle to a board from its public
identity. This is editorial metadata, not an audience-demographic claim, and the homepage discloses
it. The Middle East board includes UAE accounts, and a dedicated UAE board highlights them again.
For benchmark and compare suggestions, `src/core/analytics/country.ts` prefers a country signal from
the handle (including curated handle metadata), then public profile text, then hashtags and captions
promoting a location. Instagram still does not publish account country, so these are inference
signals, not measurements.

### Tracked pool and caching

The pool is 65 curated, real worldwide Creator/Business accounts listed in
`src/core/data/leaderboard.ts` (expanded from 25 with verified European and Middle Eastern handles
so every country board can fill). It is not an exhaustive global index, and accounts the API cannot
resolve are skipped. Results are cached for 15 minutes in the data layer, and the home page is
dynamic so that a deployment without API credentials shows an empty-state message instead of stale
data. The same pool is shared with profile pages for peer benchmarking
(`getTrackedProfiles()`).

To avoid firing 65 Meta API calls on every profile load, the pool is stored in Upstash
(`src/core/data/tracked-store.ts`) and shared between the homepage and profile pages. Empty pools
are never written, so a transient API rate limit cannot wipe a good snapshot. Meta throttles large
bursts of Business Discovery calls (`code 4`), so refreshes are deliberately paced:

- **Incremental refresh** — each 15-minute refresh updates at most `REFRESH_BATCH` (10) handles.
  Missing handles are filled first, then the rest rotate in small batches, so a partial pool
  self-heals over a few cycles and no single refresh exceeds 10 Meta calls.
- **Accumulating snapshot** — every batch is merged into the persisted snapshot, which has a 6-hour
  TTL. An API outage therefore cannot erase profiles already collected.
- **Backoff** — if ≥20% of the attempted handles fail, the in-memory cache is shortened from
  15 minutes to 10 minutes and a warning is logged, so retries pause instead of hammering Meta.
- **Signature** — the snapshot carries a handle-list signature (`analytics:tracked-pool:handles`);
  changing `LEADERBOARD_HANDLES` or the rebuild logic bumps it, and any profile no longer in the
  curated list is filtered out on the next merge.

The benchmark panel uses published Modash ranges by follower tier (Nano 5-10%, Micro 3-7%, Macro
1-3%, Mega 0.5-2%) with a link to the source. Modash calculates median likes divided by followers
over roughly three months; this app uses average likes and comments divided by followers over up
to 12 recent posts, so the comparison is directional, not exact. The matching tier also appears as
a hint on each profile's engagement card.

The homepage hero leads with a compact, top-positioned headline "Leading Instagram analytics platform
in the UAE — performance-driven tools and a practical growth plan", followed by the lookup prompt.
The browser
tab icon is an original indigo ascending-bars mark defined in `src/app/icon.svg` (Next.js `icon`
file convention), so no external icon asset is required.

## Verification badge, 30-day growth, peer and Middle East benchmark

Profile pages now surface verification, growth, and regional comparison:

- **Verification badge** (`verification-badge`) sits beside the profile name in the header and shows
  **Verified** or **Not verified** from the account's public Instagram badge. Meta's
  `business_discovery` has no verification field, so live profiles get the real badge two ways: a
  fresh public HTML profile lookup (`fetchPublicIdentity()`, 30-minute cache) when the signed proxy
  bridge is reachable, and otherwise `VERIFIED_HANDLES` in `src/core/data/verified.ts` — a snapshot of
  real public profile pages read on 2026-11-22 for the curated tracked pool, plus `rim.official__`
  confirmed from a public creator directory sourced from Instagram on 2026-11-23. Unknown handles stay
  "Not verified"; no badge is invented or modeled. The Middle East comparison panel uses creator
  category labels and the authenticity-aware regional rank described below.
- **Profile picture** (`profile-avatar`) shows the searched handle's real public avatar in the header
  (via `next/image`, with Instagram CDN hosts allow-listed in `next.config.ts`). If Instagram does
  not expose a picture or the image fails to load, the initials gradient remains as a fallback.
- **30-day growth card** was moved up into the main metric grid (`metric-grid`), right beside the
  12-month growth card, with an **Est.** badge and the same disclosure as the growth analysis below.
  The full **30-day growth analysis** (`growth-analysis`) section was also moved directly beneath
  the metric grid. It reports estimated follower change over 30 days, the median interaction trend
  across recent vs older posts, posting cadence, and the number of public posts in the last 30 days,
  plus a momentum label (accelerating / steady / cooling). For demo fixtures the follower change is
  measured from the latest two monthly history points and never modeled. For real public/live
  accounts Instagram does not publish 30-day follower history, so the change is modeled from the
  same public signals as 12-month growth and is clearly labelled **Est.**
- **Category-only matching** (`src/core/analytics/category.ts`) gates the global peer benchmarks.
  The live Instagram API only returns the generic label `Instagram Professional`, so the category is
  inferred from each account's public name and biography there. A profile is benchmarked only against
  another in the same or a closely related category. When the searched profile has an explicit
  public label, candidates must also have explicit labels: fallback `Digital creator` / `Public
  figure` guesses do not qualify as labeled peers. The Middle East panel applies the same
  creator-group rule to the inferred public category label first; post-derived activity is only
  supporting evidence. The twelve creator categories — Digital creator, Blogger,
  Personal blog, Public figure, Reel/Video creator, Content creator, Fashion model / Model, Fitness
  model, Beauty/cosmetic & personal care, Health/beauty, Travel blogger and Food blogger — are all
  mutually comparable (group `creator`). Airlines, hotels, malls, news outlets and other business or
  media accounts stay in their own isolated groups and are never used as peers for a creator. This
  means searching a beauty creator no longer surfaces an airline, a newspaper or a shopping mall as
  a "similar" profile.
- **Audience-range gate** (`isComparableRange()` in `src/core/analytics/rank.ts`) is applied to the
  global suggestions (`findClosestPeer()` and `findSimilarPeers()` in `peer.ts`): follower counts
  must be within 3x of each other and engagement rates within roughly 2x plus a 0.5-point allowance.
  A profile with thousands of followers is never benchmarked against one with millions, whatever its
  category or country. Match reasons include "similar audience size and engagement range". The
  global ranking table deliberately opts out of this hard gate so even unusually large or small
  accounts still get a full five-profile rank group; those rows are ordered by `rankScore`.
- **Middle East ±30% gate** (`isWithinFollowerLatency()` in `src/core/analytics/rank.ts`) is stricter
  and applies to both the highlighted Middle East peer and its ranking table. A candidate must have
  between 70% and 130% of the searched profile's follower count, with no out-of-band fallback.
  Candidates must also carry a creator category label in the same creator group. The panel copy
  intentionally stays concise; the gate is enforced in code and tests rather than spelled out in the
  UI.
- **Peer benchmark** (`src/core/analytics/peer.ts`) selects the closest category-compatible tracked
  real public profile. It first prefers the same inferred country (handle, then profile text, then
  promoted hashtags/captions), falling back to same region, unknown country and then different
  country only if no better tier exists. Within that tier, candidates are scored by the shared
  weighted fit (followers, engagement rate, average likes, average comments, 30-day follower
  change), exact category and shared themes. Each peer row shows its inferred category and country
  badges, match score, followers, engagement, average likes, average comments and estimated follower change, why it
  matched, and how this profile compares, with a link to a side-by-side comparison. The same
  matched set powers a five-profile ranking table (`peer-ranking`): the searched profile plus its
  four closest category peers, ordered by `rankScore`, with the searched profile's rank (for example,
  "Rank #2 of 5") and the share of peers it outperforms. Country matches lead the selection and any
  remaining rows are filled from the next country tiers, so a thin local tier cannot shorten the
  five-profile group. This table is not range-gated, so it stays complete for accounts at either
  audience extreme. If no tracked profile in a compatible category is available (for example,
  without API credentials) the panel shows an empty state rather than unrelated profiles.
- **Middle East category benchmark** (`regional-benchmark`, `src/core/analytics/regional.ts` +
  `src/core/data/regional.ts`) replaces the old UAE/GCC panel. Its pool is every tracked profile on
  the Middle East homepage board (`isInRegionBoard(username, "middle-east")`), which includes the
  UAE accounts and the other tracked Middle East countries. The curated pool includes real,
  publicly discoverable creator accounts in the relevant follower bands: `alisha_sajjal`,
  `alitofique`, `hinaashh`, `jexmi`, `najet.dh` and `elsakahwaji` around 250–327K, plus
  `donya_esmailiii`, `aiamwa`, `dina_h_ussien`, `poojaabis`, `taranum_sshahin`, `dina.ak`,
  `anshi_pandyala_official` and `zeniamk` around 46–72K. These fill five-profile ranks at both the
  larger and smaller UAE creator accounts without relaxing any gate. A candidate must (1) sit inside the
  **±30% follower band**, (2) have an explicit category label inferred from its public display
  name/bio via `inferExplicitCategory()` (fallback `Digital creator` / `Public figure` labels do not
  qualify), and (3) be in the same creator group under `isSimilarCategory()`. An exact explicit
  label match is preferred over another creator label in the same group. Post-derived
  activity from `inferPostActivity()` is supporting evidence only and never a hard gate, so hotels,
  airlines, malls and news outlets cannot become creator peers just because their captions mention
  beauty or travel. The same filtered set feeds the highlighted peer and the ranking table, so they
  cannot disagree. It shows an **80%+ relative match** (scaled 80–99, not an identity claim), key
  comparisons (Followers, Engagement rate, Avg likes, Avg comments, Follower change and
  Authenticity, labeled `est.` for real accounts), and a **Middle East rank** of five profiles — the
  searched account plus its four best in-band peers — ordered by `regionalRankScore()` — 90% weighted
  rank plus 10% authenticity, so lower modeled fake-follower share ranks higher. Each row shows the
  inferred category label, country, average likes, average comments and
  follower change. If no tracked Middle East account is inside the band with a compatible creator
  label, the panel shows a short empty state instead of substituting an out-of-band account.
- **No repeated UAE lifestyle peer** (`src/core/analytics/exclusive.ts`) treats `ola.alqodmani`
  and `trending.vibz.uae` as a mutually exclusive curated group. After all profile-page benchmark
  surfaces are built, only the better-scoring member is kept; the other is removed from the
  closest-peer card, both ranking tables and the regional comparison, with ranks and totals
  recomputed. When the searched profile is itself one of the two, that profile is the row we keep
  and the other account is removed from every peer surface. The profile page removes the duplicate
  from the tracked and regional candidate pools *before* building the benchmarks, so the fifth row
  is backfilled from the next eligible peer instead of being lost.

- **Compare rank and suggestions** (`src/app/compare/page.tsx`) use the first selected profile as
  the benchmark anchor. `buildCompareRanking()` in `src/core/analytics/compare.ts` lists other real
  public profiles from the same inferred country first and then the same wider region, keeps the
  category gate, removes every handle already in the comparison, and orders the rows by the shared
  five-signal `rankScore` (`compare-rank`). This replaces recently viewed handles being recycled as
  "suggested peers": `findSimilarPeers()` suggestions now exclude the ranked handles too, and only
  the remaining comparables are shown. Each suggestion links to a profile or adds it to the current
  comparison, so benchmarking and the PDF report can be extended with relevant peers rather than
  arbitrary handles.

All are computed on the server in `src/app/profile/[username]/page.tsx`. The tracked-pool fetch is
guarded by `isLiveConfigured()` so local development without Meta keys does not make pointless API
calls, and profile pages read the shared Upstash snapshot instead of calling Meta directly.

## Weekly digest (free 30-day trial)

The home page has a signup form for a Monday email containing the current engagement
rate, any follower decrease since the previous report, and 12-month follower growth
for one Instagram handle. Signups are idempotent per email + handle pair, require
explicit consent, and include a honeypot field. The 30-day trial is shown in the UI;
it is not automatically enforced.

For local development, signups are stored in `.data/digest-subscriptions.json`. On
Vercel, set these variables:

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | Resend API key used to send the digest. |
| `DIGEST_FROM_EMAIL` | Verified Resend sender, e.g. `Instagram Analytics <updates@yourdomain.com>`. |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint for durable signup storage. |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash REST token with write access. |
| `CRON_SECRET` | Shared secret for the Vercel Cron request and for signing unsubscribe links. |

`vercel.json` schedules `/api/digest/send` at 08:00 UTC every Monday. The sender reads
due subscriptions, reuses one profile resolution per handle, sends through Resend, and
stores the current follower count and engagement rate for next week's comparison.
Follower growth is labeled `Est.` when it is modeled. Each email includes a signed
unsubscribe link. No email is sent if Resend, Upstash, or `CRON_SECRET` is missing; the
endpoint returns a clear configuration error instead of pretending to send.

Verified on 2026-11-21: `updates.instagram-analytics.com` shows **Verified** in the
Resend dashboard, and a real test send through the production endpoint returned
`{"ok":true,"due":1,"sent":1,"failed":0}` with the email marked **Delivered** in
Resend. This caught a bug where Upstash `GET` returns a JSON *string* and the
subscription parser accepted only objects, making the hosted path silently see zero
due subscribers; `parseSubscription()` now accepts both strings and objects.

## How public lookup works

1. `GET https://www.instagram.com/{username}/` with a crawler user agent that
   receives server-rendered HTML. On Vercel, when `INSTAGRAM_PROXY_URL` is set, the
   request goes to the authenticated local proxy endpoint and is fetched from your
   home IP; direct fetch is the fallback. A transient 404, 429, or metadata-free page
   is retried once before a handle is reported as missing. Every real proxy response
   carries `X-Instagram-Proxy: ok`; any marker-less response comes from the tunnel/CDN
   with no connected origin and is reported as “Profile unavailable”, not “Profile not found”.
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

These are not published on public profile pages, so they are omitted or render as `N/A` or `—`:

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
  The official Graph API path below is primary on the public deployment, so normal
  lookups no longer depend on the local bridge. The bridge remains as a fallback for
  profiles the API cannot resolve; local lookups need no proxy.
- Embedded collab posts are counted on every profile where they appear.
- This is an unofficial reader of public pages, not the official Instagram API.

## Official Meta Graph API (active in production)

When both variables below exist, the app tries Instagram Business Discovery first and
falls back to the public reader only when that request fails. They are currently set in
Vercel **Production** (`IG_ACCESS_TOKEN` as a Secret, `IG_BUSINESS_ACCOUNT_ID` as
Config); the values are never committed or printed. They are optional for a local
checkout, where the public reader works on its own.

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

Operational limits:

- **Coverage:** only public Business/Creator accounts resolve through `business_discovery`.
  Personal accounts reject the lookup and fall back to the public reader, which still
  needs the local bridge. "Any username" is therefore not fully PC-independent.
- **Token lifetime:** long-lived Facebook user tokens expire after roughly 60 days.
  Refresh `IG_ACCESS_TOKEN` in Vercel Production before then; an expired token makes
  every lookup fall back to the bridge.
- **Metrics:** the API returns current follower/media counts only. It cannot supply
  12-month history, so growth, fake-follower, and authenticity figures remain clearly
  labelled estimates for non-demo profiles.

Verified 2026-11-21: with the local tunnel stopped, production lookups for `natgeo`,
`the.matis`, `ola.alqodmani`, and `trending.vibz.uae` all returned HTTP 200 with live
follower counts, and Vercel logs recorded `instagram live profile loaded` for each
request with **no** `instagram fetched through local proxy` entries. The bridge was
not involved in any of those requests.

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
│  ├─ analytics/compare.ts      # same-country/region weighted compare ranking
│  ├─ analytics/exclusive.ts    # mutually exclusive curated peer groups per profile page
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
| “The public lookup bridge is offline” | Cloudflare Tunnel is connected but no app is listening on `localhost:3000` | Check that the local app task/service is running; verify `INSTAGRAM_PROXY_URL` and `PROXY_SECRET` in Vercel |
| “Instagram is temporarily limiting public lookups” | Instagram refused the server IP | Retry later; check the source IP reputation if it persists |
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
