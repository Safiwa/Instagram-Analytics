import { NextResponse, type NextRequest } from "next/server";
import { saveConnectedAccount } from "../../../../core/db/connected";
import {
  CONFIG_PERMISSIONS,
  connectConfig,
  exchangeCode,
  fetchConnectedClient,
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
    const token = await exchangeCode(config, code);
    const client = await fetchConnectedClient(token.accessToken);
    if (client.instagramAccounts.length === 0) {
      return finish(request, "error=no-account");
    }

    // One token covers every Instagram account the creator shared.
    let firstAccountId: string | null = null;
    for (const instagram of client.instagramAccounts) {
      const account = await saveConnectedAccount({
        igUserId: instagram.id,
        username: instagram.username,
        accountType: "PROFESSIONAL",
        accessToken: token.accessToken,
        tokenExpiresAt: token.expiresAt,
        scopes: [...CONFIG_PERMISSIONS],
        clientBusinessId: client.clientBusinessId,
        metaUserId: client.metaUserId,
      });
      firstAccountId ??= account.id;
      // First insights pull right away, so the creator sees their data at once.
      await syncConnectedAccount({ ...account, accessToken: token.accessToken });
      log.info("instagram account connected", { handle: instagram.username });
    }

    const response = finish(request, "connected=1");
    response.cookies.set(SESSION_COOKIE, signValue(firstAccountId!, SESSION_TTL_SECONDS), {
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
