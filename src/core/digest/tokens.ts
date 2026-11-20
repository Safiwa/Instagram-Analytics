import { createHmac, timingSafeEqual } from "node:crypto";

export type DigestIdentity = {
  email: string;
  handle: string;
};

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createUnsubscribeToken(email: string, handle: string, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ e: email, h: handle })).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function readUnsubscribeToken(token: string, secret: string): DigestIdentity | null {
  if (!secret) {
    return null;
  }

  const [payload, provided] = token.split(".");
  if (!payload || !provided) {
    return null;
  }

  const expected = signature(payload, secret);
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const { e, h } = parsed as { e?: unknown; h?: unknown };
    if (typeof e !== "string" || typeof h !== "string" || !e || !h) {
      return null;
    }
    return { email: e, handle: h };
  } catch {
    return null;
  }
}
