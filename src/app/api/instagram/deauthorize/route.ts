import { deleteConnectedAccount } from "../../../../core/db/connected";
import { connectConfig } from "../../../../core/instagram/api";
import { parseSignedRequest } from "../../../../core/instagram/crypto";
import { log } from "../../../../core/logging/logger";

export const runtime = "nodejs";

// Meta calls this when a creator removes the app from their Instagram settings.
// The connection, its token and all shared insights are deleted.
export async function POST(request: Request) {
  const config = connectConfig();
  const form = await request.formData().catch(() => null);
  const signed = form?.get("signed_request");
  const payload =
    config && typeof signed === "string" ? parseSignedRequest(signed, config.appSecret) : null;
  if (!payload?.user_id) {
    return Response.json({ error: "Invalid signed_request." }, { status: 400 });
  }
  const removed = await deleteConnectedAccount({ metaId: String(payload.user_id) });
  log.info("instagram deauthorize processed", { removed: removed.length });
  return Response.json({ ok: true });
}
