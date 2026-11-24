import { NextResponse, type NextRequest } from "next/server";
import { authorizeUrl, connectConfig } from "../../../../core/instagram/api";
import { randomNonce, signValue } from "../../../../core/instagram/crypto";
import {
  COOKIE_OPTIONS,
  isConnectAvailable,
  STATE_COOKIE,
  STATE_TTL_SECONDS,
} from "../../../../core/instagram/session";

export const runtime = "nodejs";

// Starts Business Login for Instagram. A signed, short-lived state cookie
// protects the callback against cross-site request forgery.
export function GET(request: NextRequest) {
  const config = connectConfig();
  if (!config || !isConnectAvailable()) {
    return NextResponse.redirect(new URL("/connect?error=not-enabled", request.url));
  }
  const state = randomNonce();
  const response = NextResponse.redirect(authorizeUrl(config, state));
  response.cookies.set(STATE_COOKIE, signValue(state, STATE_TTL_SECONDS), {
    ...COOKIE_OPTIONS,
    maxAge: STATE_TTL_SECONDS,
  });
  return response;
}
