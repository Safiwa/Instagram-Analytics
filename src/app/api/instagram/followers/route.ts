import { NextResponse, type NextRequest } from "next/server";
import { getConnectedAccount } from "../../../../core/db/connected";
import { parseFollowerExport, saveFollowerUpload } from "../../../../core/db/followerChecks";
import { runFollowerChecks } from "../../../../core/instagram/followerCheckRunner";
import { SESSION_COOKIE, sessionAccountId } from "../../../../core/instagram/session";
import { log } from "../../../../core/logging/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function back(request: NextRequest, query: string): NextResponse {
  return NextResponse.redirect(new URL(`/connect?${query}#follower-audit`, request.url), 303);
}

// The signed-in creator uploads the followers file from Instagram's
// "Download your information" export. The list replaces any earlier upload,
// and the first checks run straight away; the daily collector finishes the rest.
export async function POST(request: NextRequest) {
  const accountId = sessionAccountId(request.cookies.get(SESSION_COOKIE)?.value);
  const account = accountId ? await getConnectedAccount(accountId) : null;
  if (!account) {
    return back(request, "error=expired");
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("followers");
  if (!(file instanceof File) || file.size === 0) {
    return back(request, "error=no-file");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return back(request, "error=file-too-large");
  }

  const handles = parseFollowerExport(await file.text()).filter((handle) => handle !== account.username);
  if (handles.length === 0) {
    return back(request, "error=no-followers");
  }

  try {
    const sampled = await saveFollowerUpload(account.id, handles);
    const run = await runFollowerChecks({ budgetMs: 25_000, accountId: account.id, limit: sampled });
    log.info("follower list uploaded", { handle: account.username, listed: handles.length, sampled, ...run });
    return back(request, "followers=uploaded");
  } catch (error) {
    log.error("follower upload failed", { message: error instanceof Error ? error.message : "unknown" });
    return back(request, "error=failed");
  }
}
