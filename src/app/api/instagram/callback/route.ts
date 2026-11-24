import { NextResponse, type NextRequest } from "next/server";
import { saveConnectedAccount } from "../../../../core/db/connected";
import {
  connectConfig,
  exchangeCode,
  exchangeLongLived,
  fetchMe,
} from "../../../../core/instagram/api";
import { signValue, verifySignedValue } from "../../../../core/instagram/crypto";
import {
  COOKIE_OPTIONS,
  isConnectAvailable,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  STATE_COOKIE,
} from "../../../../core/instagram/session";
import { syncConnectedAccount } from "../../../../core/instagram/sync";
import { log } from "../../../../core/logging/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

const PROFESSIONAL_TYPES = new Set(["BUSINESS", "MEDIA_CREATOR", "CREATOR"]);

function finish(request: NextRequest, query: string): NextResponse {
  const response = NextResponse.redirect(new URL(`/connect?${query}`, request.url));
  response.cookies.delete(STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const config = connectConfig();
  if (!config || !isConnectAvailable()) {
    return finish(request, "error=not-enabled");
  }
  if (params.get("error")) {
    return finish(request, "error=denied");
  }

  const expected = verifySignedValue(request.cookies.get(STATE_COOKIE)?.value);
  const code = params.get("code");
  if (!expected || params.get("state") !== expected || !code) {
    return finish(request, "error=expired");
  }

  try {
    const short = await exchangeCode(config, code.replace(/#_$/, ""));
    const long = await exchangeLongLived(config, short.accessToken);
    const me = await fetchMe(long.accessToken);
    if (me.accountType && !PROFESSIONAL_TYPES.has(me.accountType.toUpperCase())) {
      return finish(request, "error=not-professional");
    }

    const account = await saveConnectedAccount({
      igUserId: me.userId,
      username: me.username,
      accountType: me.accountType,
      accessToken: long.accessToken,
      tokenExpiresAt: long.expiresAt,
      scopes: short.permissions,
    });
    // First insights pull right away, so the creator sees their data at once.
    await syncConnectedAccount({ ...account, accessToken: long.accessToken, tokenRefreshedAt: new Date().toISOString() });
    log.info("instagram account connected", { handle: me.username });

    const response = finish(request, "connected=1");
    response.cookies.set(SESSION_COOKIE, signValue(account.id, SESSION_TTL_SECONDS), {
      ...COOKIE_OPTIONS,
      maxAge: SESSION_TTL_SECONDS,
    });
    return response;
  } catch (error) {
    log.error("instagram connect failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return finish(request, "error=failed");
  }
}
