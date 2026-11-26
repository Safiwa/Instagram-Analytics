import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

// CONNECT_SECRET is the single server-side secret for creator connections. Two
// independent keys are derived from it: one encrypts stored access tokens, the
// other signs the OAuth state and session cookies.

function secret(): string | null {
  const value = process.env.CONNECT_SECRET?.trim();
  return value && value.length >= 32 ? value : null;
}

function deriveKey(purpose: "token-encryption" | "cookie-signing"): Buffer {
  const base = secret();
  if (!base) {
    throw new Error("CONNECT_SECRET is not configured (32+ characters required).");
  }
  return Buffer.from(hkdfSync("sha256", base, "instagram-analytics", purpose, 32));
}

export function isConnectSecretConfigured(): boolean {
  return secret() !== null;
}

// AES-256-GCM: "v1.<iv>.<tag>.<ciphertext>", all base64url.
export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey("token-encryption"), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function decryptToken(sealed: string): string {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !body) {
    throw new Error("Unrecognised token format.");
  }
  const decipher = createDecipheriv("aes-256-gcm", deriveKey("token-encryption"), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

function sign(payload: string): string {
  return createHmac("sha256", deriveKey("cookie-signing")).update(payload).digest("base64url");
}

// "<payload>.<expiresAtMs>.<signature>" — payload must not contain dots.
export function signValue(payload: string, ttlSeconds: number, now = Date.now()): string {
  if (payload.includes(".")) {
    throw new Error("Signed payloads cannot contain dots.");
  }
  const body = `${payload}.${now + ttlSeconds * 1000}`;
  return `${body}.${sign(body)}`;
}

export function verifySignedValue(value: string | undefined, now = Date.now()): string | null {
  if (!value || !secret()) {
    return null;
  }
  const parts = value.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const [payload, expires, signature] = parts;
  const expected = Buffer.from(sign(`${payload}.${expires}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null;
  }
  return Number(expires) > now ? payload : null;
}

export function randomNonce(): string {
  return randomBytes(18).toString("base64url");
}

// Meta deauthorize and data-deletion callbacks send a `signed_request`:
// "<base64url signature>.<base64url JSON payload>", HMAC-SHA256 with the app secret.
export function parseSignedRequest(
  signedRequest: string,
  appSecret: string,
): { user_id?: string; algorithm?: string; issued_at?: number } | null {
  const [encodedSignature, encodedPayload] = signedRequest.split(".");
  if (!encodedSignature || !encodedPayload || !appSecret) {
    return null;
  }
  const expected = createHmac("sha256", appSecret).update(encodedPayload).digest();
  const given = Buffer.from(encodedSignature, "base64url");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    return payload?.algorithm?.toUpperCase() === "HMAC-SHA256" ? payload : null;
  } catch {
    return null;
  }
}
