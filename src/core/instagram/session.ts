import { isDatabaseConfigured } from "../db/client";
import { connectConfig } from "./api";
import { isConnectSecretConfigured, verifySignedValue } from "./crypto";

export const STATE_COOKIE = "ig_oauth_state";
export const SESSION_COOKIE = "ig_session";
export const STATE_TTL_SECONDS = 10 * 60;
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

// Creator connections need the Instagram app credentials, CONNECT_SECRET and the
// database. Without all three the connect page explains that it is not enabled.
export function isConnectAvailable(): boolean {
  return connectConfig() !== null && isConnectSecretConfigured() && isDatabaseConfigured();
}

export function sessionAccountId(cookieValue: string | undefined): string | null {
  const id = verifySignedValue(cookieValue);
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
};
