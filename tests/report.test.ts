import { PDFDocument } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../src/app/api/report/route";
import { getProfile } from "../src/core/data/adapter";
import { clearPublicCache } from "../src/core/data/public";
import type { CreatorProfile } from "../src/core/data/types";
import { buildReport } from "../src/features/report/reportDocument";

function fixture(handle: string): CreatorProfile {
  const profile = getProfile(handle);
  if (!profile) {
    throw new Error(`Missing fixture: ${handle}`);
  }
  return profile;
}

describe("PDF report", () => {
  afterEach(() => {
    clearPublicCache();
    vi.unstubAllGlobals();
  });

  it("builds a valid PDF with a deterministic filename", async () => {
    const report = await buildReport([fixture("nora.style"), fixture("lumen.travel")]);

    expect(report.filename).toBe("ig-analysis-nora.style-lumen.travel.pdf");
    expect(String.fromCharCode(...report.bytes.slice(0, 5))).toBe("%PDF-");
    await expect(PDFDocument.load(report.bytes)).resolves.toBeDefined();
  });

  it("returns a PDF response with download headers", async () => {
    const response = await GET(
      new Request("http://localhost/api/report?handles=nora.style,lumen.travel"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain(
      'filename="ig-analysis-nora.style-lumen.travel.pdf"',
    );

    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("rejects unavailable handles with a 400 JSON error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));

    const response = await GET(
      new Request("http://localhost/api/report?handles=nora.style,ghost.account"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Unavailable handle(s): ghost.account",
    });
  });

  it("builds a live report without audience data and with non-ASCII names", async () => {
    const live: CreatorProfile = {
      username: "live.test",
      displayName: "اسم تجريبي 🎯",
      category: "Instagram Professional",
      bio: "Live bio with emoji 🚀",
      followers: 15000,
      following: 300,
      postsCount: 42,
      isVerified: false,
      source: "live",
      followerHistory: [],
      recentPosts: [],
      audience: undefined,
    };

    const report = await buildReport([live]);

    expect(report.filename).toBe("ig-analysis-live.test.pdf");
    expect(String.fromCharCode(...report.bytes.slice(0, 5))).toBe("%PDF-");
    await expect(PDFDocument.load(report.bytes)).resolves.toBeDefined();
  });

  it("rejects an empty handle list", async () => {
    const response = await GET(new Request("http://localhost/api/report"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Provide at least one handle.",
    });
  });
});
