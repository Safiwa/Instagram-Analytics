import { log } from "../../../core/logging/logger";

export const maxDuration = 30;

const ALLOWED_HOSTS = new Set(["www.instagram.com", "i.instagram.com"]);
const WEB_PROFILE_PATH = "/api/v1/users/web_profile_info/";
const EMBED_PATTERN = /^\/p\/[A-Za-z0-9_-]+\/embed\/captioned\/$/;
const PROFILE_PATTERN = /^\/[A-Za-z0-9._]{1,30}\/$/;

const BROWSER_HEADERS = {
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
};

const WEB_PROFILE_HEADERS = {
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  "x-ig-app-id": "936619743392459",
};

function isAllowedTarget(target: string): boolean {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return false;
  }

  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
    return false;
  }
  if (url.username || url.password) {
    return false;
  }

  return (
    url.pathname === WEB_PROFILE_PATH ||
    EMBED_PATTERN.test(url.pathname) ||
    PROFILE_PATTERN.test(url.pathname)
  );
}

export async function GET(request: Request) {
  const secret = process.env.PROXY_SECRET?.trim();
  if (!secret) {
    return Response.json({ error: "Instagram proxy is not configured." }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const target = new URL(request.url).searchParams.get("url") ?? "";
  if (!isAllowedTarget(target)) {
    return Response.json({ error: "Only public Instagram profile and embed URLs are allowed." }, {
      status: 400,
    });
  }

  const parsed = new URL(target);
  const headers =
    parsed.pathname === WEB_PROFILE_PATH
      ? WEB_PROFILE_HEADERS
      : BROWSER_HEADERS;

  try {
    const response = await fetch(target, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    log.info("local instagram proxy fetched", { target, status: response.status });
    return new Response(await response.arrayBuffer(), {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    log.warn("local instagram proxy failed", {
      target,
      message: error instanceof Error ? error.message : "network",
    });
    return Response.json({ error: "Could not reach Instagram." }, { status: 502 });
  }
}
