import { createHmac } from "node:crypto";
import { cookies, headers } from "next/headers";
import { isConnectSecretConfigured, signValue, verifySignedValue } from "../instagram/crypto";
import { log } from "../logging/logger";
import { countLookups, getUser, hasLookedUp, listSubscriptions, type SiteUser, type StoredSubscription } from "./accounts";
import { isBillingEnabled } from "./dodo";
import { effectivePlan, PLANS, usagePeriod, type Plan } from "./plans";

// Who is looking at the page, which plan applies and which usage bucket they
// draw from. Signed-in visitors are metered per account; everyone else per
// (hashed) IP address. Search-engine crawlers are never metered, so public
// profile pages stay indexable.

export const ACCOUNT_COOKIE = "ia_account";
export const ACCOUNT_TTL_SECONDS = 30 * 24 * 60 * 60;
export const LOGIN_LINK_TTL_SECONDS = 15 * 60;

export const ACCOUNT_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
};

export type Viewer = {
  billingEnabled: boolean;
  user: SiteUser | null;
  plan: Plan;
  subscriptions: StoredSubscription[];
  // Usage bucket: "user:<id>" or "ip:<hmac>"; null for crawlers / no billing.
  subject: string | null;
};

const SEARCH_CRAWLERS =
  /googlebot|google-inspectiontool|bingbot|duckduckbot|yandex(bot)?|baiduspider|applebot|slurp|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|slackbot|discordbot/i;

export function isSearchCrawler(userAgent: string | null): boolean {
  return Boolean(userAgent && SEARCH_CRAWLERS.test(userAgent));
}

// base64url email (no dots) so it fits signValue's "<payload>.<exp>.<sig>".
export function loginToken(email: string): string {
  return signValue(Buffer.from(email, "utf8").toString("base64url"), LOGIN_LINK_TTL_SECONDS);
}

export function emailFromLoginToken(token: string | null): string | null {
  const payload = verifySignedValue(token ?? undefined);
  if (!payload) {
    return null;
  }
  try {
    return Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

export function accountCookieValue(userId: string): string {
  return signValue(userId, ACCOUNT_TTL_SECONDS);
}

export function accountIdFromCookie(value: string | undefined): string | null {
  const id = verifySignedValue(value);
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

export function ipSubject(ip: string): string {
  if (!isConnectSecretConfigured()) {
    return `ip:${ip}`;
  }
  // Keyed hash: the raw address is never stored.
  const key = process.env.CONNECT_SECRET!.trim();
  return `ip:${createHmac("sha256", key).update(`usage:${ip}`).digest("base64url").slice(0, 32)}`;
}

function clientIp(list: Headers): string {
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || list.get("x-real-ip")?.trim() || "unknown";
}

const UNMETERED: Omit<Viewer, "billingEnabled"> = {
  user: null,
  plan: PLANS.agency,
  subscriptions: [],
  subject: null,
};

export async function getViewer(): Promise<Viewer> {
  if (!isBillingEnabled()) {
    // Before Dodo Payments is configured the site behaves as it always has.
    return { billingEnabled: false, ...UNMETERED };
  }

  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const userId = accountIdFromCookie(cookieStore.get(ACCOUNT_COOKIE)?.value);

  try {
    const user = userId ? await getUser(userId) : null;
    if (user) {
      const subscriptions = await listSubscriptions(user.id);
      return {
        billingEnabled: true,
        user,
        plan: PLANS[effectivePlan(subscriptions)],
        subscriptions,
        subject: `user:${user.id}`,
      };
    }
  } catch (error) {
    // A database hiccup must not lock paying users out: treat it as unmetered.
    log.warn("viewer lookup failed", { message: error instanceof Error ? error.message : "unknown" });
    return { billingEnabled: true, ...UNMETERED };
  }

  const crawler = isSearchCrawler(headerList.get("user-agent"));
  return {
    billingEnabled: true,
    user: null,
    plan: PLANS.free,
    subscriptions: [],
    subject: crawler ? null : ipSubject(clientIp(headerList)),
  };
}

export type LookupGate = {
  allowed: boolean;
  used: number;
  period: string;
  // Handles that will be newly counted if the page is shown.
  toRecord: string[];
};

// Profiles already opened this period do not count again. Fails open on a
// database error.
export async function checkLookups(viewer: Viewer, usernames: readonly string[]): Promise<LookupGate> {
  const period = usagePeriod(viewer.plan.limits);
  if (!viewer.subject || usernames.length === 0) {
    return { allowed: true, used: 0, period, toRecord: [] };
  }
  try {
    const subject = viewer.subject;
    const seen = await Promise.all(usernames.map((name) => hasLookedUp(subject, period, name)));
    const fresh = usernames.filter((_, index) => !seen[index]);
    const used = await countLookups(subject, period);
    return { allowed: used + fresh.length <= viewer.plan.limits.lookups, used, period, toRecord: fresh };
  } catch (error) {
    log.warn("lookup quota check failed", { message: error instanceof Error ? error.message : "unknown" });
    return { allowed: true, used: 0, period, toRecord: [] };
  }
}
