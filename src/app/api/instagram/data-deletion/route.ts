import { createHash } from "node:crypto";
import { deleteConnectedAccount } from "../../../../core/db/connected";
import { connectConfig } from "../../../../core/instagram/api";
import { parseSignedRequest } from "../../../../core/instagram/crypto";
import { log } from "../../../../core/logging/logger";

export const runtime = "nodejs";

// Meta's data deletion callback. Deletion is immediate, so the status URL can
// confirm completion straight away.
export async function POST(request: Request) {
  const config = connectConfig();
  const form = await request.formData().catch(() => null);
  const signed = form?.get("signed_request");
  const payload =
    config && typeof signed === "string" ? parseSignedRequest(signed, config.appSecret) : null;
  if (!payload?.user_id) {
    return Response.json({ error: "Invalid signed_request." }, { status: 400 });
  }
  const userId = String(payload.user_id);
  await deleteConnectedAccount({ igUserId: userId });
  const confirmationCode = createHash("sha256").update(`${userId}:${payload.issued_at ?? ""}`).digest("hex").slice(0, 16);
  log.info("instagram data deletion processed", { code: confirmationCode });
  return Response.json({
    url: new URL(`/privacy?deletion=${confirmationCode}#data-deletion`, request.url).toString(),
    confirmation_code: confirmationCode,
  });
}
