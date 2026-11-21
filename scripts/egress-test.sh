#!/usr/bin/env bash
# Bare-VPS Instagram egress test.
#
# Purpose: prove whether a fresh VPS IP can reach Instagram's public,
# server-rendered data before paying for a full production migration.
# It makes only two requests, using the exact headers the app uses in
# src/core/data/public.ts, so a PASS here means the app will work here.
#
# Usage (repo is private — use scp, not a raw.githubusercontent.com URL):
#   scp scripts/egress-test.sh root@YOUR_VPS_IP:~/egress-test.sh
#   chmod +x egress-test.sh
#   ./egress-test.sh              # defaults to natgeo
#   ./egress-test.sh cristiano    # or any public handle
#
# Exit 0 = PASS, exit 1 = FAIL. Do not re-run more than once every few minutes;
# repeated requests from a fresh IP can trigger a real 429.

set -uo pipefail

USERNAME="${1:-natgeo}"
WORK_DIR="$(mktemp -d)"
PROFILE_FILE="$WORK_DIR/profile.html"
INFO_FILE="$WORK_DIR/info.json"
trap 'rm -rf "$WORK_DIR"' EXIT

# Matches src/core/data/public.ts exactly.
BOT_UA='Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
CHROME_UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
IG_APP_ID='936619743392459'

if ! command -v curl >/dev/null 2>&1; then
  echo "FAIL: curl is missing. Install it with: apt-get update && apt-get install -y curl"
  exit 1
fi

echo "Instagram egress test for @$USERNAME"
echo "VPS public IP: $(curl -fsS --max-time 5 https://ifconfig.me 2>/dev/null || echo 'unknown')"
echo

# 1. Server-rendered profile page (HEADERS in public.ts).
PROFILE_META="$(curl -sS -L --compressed --max-time 20 \
  -o "$PROFILE_FILE" -w $'%{http_code}\t%{url_effective}' \
  -H 'Accept: text/html,application/xhtml+xml' \
  -H 'Accept-Language: en-US,en;q=0.9' \
  -A "$BOT_UA" \
  "https://www.instagram.com/$USERNAME/")"
PROFILE_STATUS="${PROFILE_META%%$'\t'*}"
PROFILE_URL="${PROFILE_META#*$'\t'}"

# 2. web_profile_info fallback (WEB_PROFILE_HEADERS in public.ts).
INFO_STATUS="$(curl -sS -L --compressed --max-time 20 \
  -o "$INFO_FILE" -w '%{http_code}' \
  -H 'Accept: */*' \
  -H 'Accept-Language: en-US,en;q=0.9' \
  -A "$CHROME_UA" \
  -H "x-ig-app-id: $IG_APP_ID" \
  "https://www.instagram.com/api/v1/users/web_profile_info/?username=$USERNAME")"

# --- Profile page checks ---
# A normal logged-out page contains an accounts/login link in its header, so
# only the FINAL redirect URL proves an actual login wall or challenge.
BLOCKER=""
if printf '%s' "$PROFILE_URL" | grep -qiE 'accounts/login|/challenge/|checkpoint'; then
  BLOCKER="login wall redirect"
fi
if [ "$PROFILE_STATUS" = "429" ]; then BLOCKER="429 rate limit"; fi

OG_TITLE="$(grep -oiE '<meta[^>]+og:title[^>]*>' "$PROFILE_FILE" \
  | head -1 | sed -E 's/.*content="([^"]*)".*/\1/')"
HAS_USER_JSON="$(grep -c "\"username\":\"$USERNAME\"" "$PROFILE_FILE" || true)"

PROFILE_OK=1
[ "$PROFILE_STATUS" = "200" ] || PROFILE_OK=0
[ -z "$BLOCKER" ] || PROFILE_OK=0
if [ "$HAS_USER_JSON" -eq 0 ] && ! printf '%s' "$OG_TITLE" | grep -qi "$USERNAME"; then
  PROFILE_OK=0
fi

# --- web_profile_info checks ---
INFO_OK=1
[ "$INFO_STATUS" = "200" ] || INFO_OK=0
grep -q '"data"' "$INFO_FILE" || INFO_OK=0
grep -q '"user"' "$INFO_FILE" || INFO_OK=0
if grep -qE '"status"[[:space:]]*:[[:space:]]*"fail"' "$INFO_FILE"; then INFO_OK=0; fi
if grep -qE '"data"[[:space:]]*:[[:space:]]*null' "$INFO_FILE"; then INFO_OK=0; fi

echo "Profile page    : HTTP $PROFILE_STATUS | og:title=${OG_TITLE:-none} | user-json=$HAS_USER_JSON | blocker=${BLOCKER:-none}"
echo "web_profile_info: HTTP $INFO_STATUS | bytes=$(wc -c < "$INFO_FILE" | tr -d ' ') | data+user=$( [ "$INFO_OK" = 1 ] && echo yes || echo no)"
echo

# The profile page is the app's primary data source. web_profile_info is only a
# fallback for pages with no preloaded posts, and can return 429 even from a
# known-good residential IP. It is reported but does not decide the verdict.
if [ "$INFO_OK" = 0 ]; then
  echo "NOTE: web_profile_info did not return data; the app falls back to the profile page."
  echo
fi

if [ "$PROFILE_OK" = 1 ]; then
  echo "PASS: this IP can read public Instagram data."
  echo "Next: provision the production plan, or extract the standalone proxy."
  exit 0
fi

if [ "$PROFILE_STATUS" = "200" ] && [ -z "$BLOCKER" ]; then
  echo "INCONCLUSIVE: the page loaded but held no profile data for @$USERNAME."
  echo "Try a known public handle (natgeo, nasa, cristiano) before deciding."
  exit 2
fi

echo "FAIL: Instagram rejected this IP (login wall, 429, challenge, or empty data)."
echo "Action: delete this VPS. No other datacenter provider will fix IP reputation."
exit 1
