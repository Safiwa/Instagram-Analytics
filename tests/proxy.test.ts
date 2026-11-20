import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../src/app/api/instagram-proxy/route";

function proxyRequest(target: string, secret = "test-secret"): Request {
  const url = new URL("https://analytics.example.com/api/instagram-proxy");
  url.searchParams.set("url", target);
  return new Request(url, { headers: { Authorization: `Bearer ${secret}` } });
}

describe("local Instagram proxy route", () => {
  beforeEach(() => {
    vi.stubEnv("PROXY_SECRET", "test-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("requires a configured secret", async () => {
    vi.stubEnv("PROXY_SECRET", "");
    const response = await GET(proxyRequest("https://www.instagram.com/natgeo/"));

    expect(response.status).toBe(503);
    expect(response.headers.get("x-instagram-proxy")).toBe("ok");
  });

  it("rejects requests without the shared secret", async () => {
    const response = await GET(proxyRequest("https://www.instagram.com/natgeo/", "wrong"));

    expect(response.status).toBe(401);
    expect(response.headers.get("x-instagram-proxy")).toBe("ok");
  });

  it("rejects non-Instagram targets", async () => {
    const response = await GET(proxyRequest("https://example.com/admin"));

    expect(response.status).toBe(400);
  });

  it("rejects unexpected Instagram paths", async () => {
    const response = await GET(proxyRequest("https://www.instagram.com/accounts/login/"));

    expect(response.status).toBe(400);
  });

  it("fetches public profile pages with a crawler user agent", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://www.instagram.com/natgeo/");
      expect(init?.headers).toMatchObject({
        "User-Agent": expect.stringContaining("Googlebot"),
      });
      return new Response("<html>profile</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(proxyRequest("https://www.instagram.com/natgeo/"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("x-instagram-proxy")).toBe("ok");
    expect(await response.text()).toBe("<html>profile</html>");
  });

  it("sends the app id header to web_profile_info", async () => {
    const target = "https://www.instagram.com/api/v1/users/web_profile_info/?username=natgeo";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ "x-ig-app-id": "936619743392459" });
      return new Response('{"data":{}}', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(proxyRequest(target));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});
