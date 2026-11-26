import { createHash, timingSafeEqual } from "node:crypto";
import { isConnectSecretConfigured, signValue, verifySignedValue } from "../instagram/crypto";

// The admin pages are protected by ADMIN_PASSWORD (set in Vercel by the site
// owner). A successful login sets a signed, httpOnly cookie for 12 hours,
// signed with the existing CONNECT_SECRET.
export const ADMIN_COOKIE = "ia_admin";
export const ADMIN_TTL_SECONDS = 12 * 60 * 60;
const ADMIN_PAYLOAD = "admin";

export const ADMIN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  path: "/",
};

function configuredPassword(): string | null {
  const value = process.env.ADMIN_PASSWORD?.trim();
  return value && value.length >= 12 ? value : null;
}

export function isAdminConfigured(): boolean {
  return configuredPassword() !== null && isConnectSecretConfigured();
}

export function passwordMatches(candidate: string): boolean {
  const expected = configuredPassword();
  if (!expected) {
    return false;
  }
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(candidate), digest(expected));
}

export function adminCookieValue(): string {
  return signValue(ADMIN_PAYLOAD, ADMIN_TTL_SECONDS);
}

export function isAdminSession(cookieValue: string | undefined): boolean {
  return isAdminConfigured() && verifySignedValue(cookieValue) === ADMIN_PAYLOAD;
}

// Form posts must come from this site (defence in depth on top of the
// SameSite=Strict cookie).
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    return false;
  }
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}
