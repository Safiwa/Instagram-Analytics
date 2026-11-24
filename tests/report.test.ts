import {
  PDFArray,
  PDFDocument,
  PDFRawStream,
  PDFRef,
  decodePDFRawStream,
} from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../src/app/api/report/route";
import { getProfile } from "../src/core/data/adapter";
import { clearPublicCache } from "../src/core/data/public";
import type { CreatorProfile } from "../src/core/data/types";
import { REPORT_BRAND, buildReport } from "../src/features/report/reportDocument";

const TINY_PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await PDFDocument.load(bytes);
  let content = "";
  for (const page of pdf.getPages()) {
    const contents = page.node.Contents();
    if (!contents) {
      continue;
    }
    const entries = contents instanceof PDFArray ? contents.asArray() : [contents];
    for (const entry of entries) {
      const resolved = entry instanceof PDFRef ? pdf.context.lookup(entry) : entry;
      if (!(resolved instanceof PDFRawStream)) {
        continue;
      }
      content += Buffer.from(decodePDFRawStream(resolved).decode()).toString("latin1");
    }
  }

  return [...content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)]
    .map((match) => Buffer.from(match[1], "hex").toString("latin1").replace(/\0/g, ""))
    .join(" ");
}

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

  it("builds a valid PDF with a deterministic filename and Campaign Masters branding", async () => {
    const report = await buildReport([fixture("nora.style"), fixture("lumen.travel")]);

    expect(REPORT_BRAND).toBe("INSTAGRAM ANALYTICS by Campaign Masters UAE");
    expect(report.filename).toBe("ig-analysis-nora.style-lumen.travel.pdf");
    expect(String.fromCharCode(...report.bytes.slice(0, 5))).toBe("%PDF-");
    await expect(PDFDocument.load(report.bytes)).resolves.toBeDefined();
    await expect(extractPdfText(report.bytes)).resolves.toContain(REPORT_BRAND);
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

  it("embeds an allowed public profile photo when the avatar URL is reachable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(TINY_PNG, {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const withAvatar = await buildReport([
      {
        ...fixture("nora.style"),
        profilePictureUrl: "https://scontent-abc.fbcdn.net/v/t51.2885-19/avatar.png",
      },
    ]);
    const withoutAvatar = await buildReport([fixture("nora.style")]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://scontent-abc.fbcdn.net/v/t51.2885-19/avatar.png",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(withAvatar.bytes.length).toBeGreaterThan(withoutAvatar.bytes.length);
  });

  it("ignores avatar URLs outside the Instagram CDN allowlist", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await buildReport([
      {
        ...fixture("nora.style"),
        profilePictureUrl: "http://localhost:3000/private-avatar.png",
      },
    ]);

    expect(fetchMock).not.toHaveBeenCalled();
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

  it("builds a report with modeled public estimates", async () => {
    const profile: CreatorProfile = {
      username: "estimate.test",
      displayName: "Estimate Test",
      category: "Creator",
      bio: "Public estimate report",
      followers: 12_000,
      following: 300,
      postsCount: 60,
      isVerified: false,
      source: "public",
      followerHistory: [],
      recentPosts: Array.from({ length: 5 }, (_, index) => ({
        id: `e${index}`,
        type: "Reel",
        caption: `Post ${index}`,
        postedAt: new Date(Date.UTC(2026, 9, 1 + index * 7)).toISOString(),
        likes: 300 + index,
        comments: 20,
        hashtags: [],
      })),
    };

    const report = await buildReport([profile]);

    expect(report.filename).toBe("ig-analysis-estimate.test.pdf");
    await expect(PDFDocument.load(report.bytes)).resolves.toBeDefined();
  });

  it("shows N/A instead of false zeros when no posts are exposed", async () => {
    const profile: CreatorProfile = {
      username: "no.posts",
      displayName: "No Posts",
      category: "Creator",
      bio: "Public profile without exposed posts",
      followers: 12_000,
      following: 200,
      postsCount: 40,
      isVerified: false,
      source: "public",
      followerHistory: [],
      recentPosts: [],
    };

    const report = await buildReport([profile]);
    const text = await extractPdfText(report.bytes);

    expect(text).toContain("N/A");
    expect(text).toContain("No posts are exposed by the public source");
    expect(text).not.toContain("0.00%");
  });

  it("rejects an empty handle list", async () => {
    const response = await GET(new Request("http://localhost/api/report"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Provide at least one handle.",
    });
  });
});
