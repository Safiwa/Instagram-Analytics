import { NextResponse, type NextRequest } from "next/server";
import { deleteConnectedAccount } from "../../../../core/db/connected";
import { SESSION_COOKIE, sessionAccountId } from "../../../../core/instagram/session";
import { log } from "../../../../core/logging/logger";

export const runtime = "nodejs";

// Deletes the signed-in creator's connection, stored token and all shared
// insights, then clears the session. Public snapshots of the profile remain,
// as for any public account.
export async function POST(request: NextRequest) {
  const accountId = sessionAccountId(request.cookies.get(SESSION_COOKIE)?.value);
  if (accountId) {
    const username = await deleteConnectedAccount({ id: accountId });
    log.info("instagram account disconnected", { handle: username ?? "unknown" });
  }
  const response = NextResponse.redirect(new URL("/connect?disconnected=1", request.url), 303);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
