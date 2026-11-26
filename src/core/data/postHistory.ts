import { log } from "../logging/logger";

// One public post's metrics, as Instagram reports them now.
export type HistoryPost = {
  postedAt: string;
  type: "Reel" | "Carousel" | "Photo" | "Video";
  likes: number | null; // null when the owner hides likes
  comments: number;
  views: number | null;
};

type Media = {
  media_type?: string;
  media_product_type?: string;
  like_count?: number;
  comments_count?: number;
  timestamp?: string;
  view_count?: number;
};

type Response = {
  business_discovery?: { media?: { data?: Media[]; paging?: { cursors?: { after?: string } } } };
  error?: { message?: string; code?: number };
};

export const HISTORY_DAYS = 365;
const PAGE_SIZE = 50;
const MAX_PAGES = 3; // at most 150 posts per account
const DAY_MS = 86_400_000;
const FIELDS = "media_type,media_product_type,like_count,comments_count,timestamp,view_count";

function config() {
  return {
    token: process.env.IG_ACCESS_TOKEN?.trim(),
    accountId: process.env.IG_BUSINESS_ACCOUNT_ID?.trim(),
    version: process.env.IG_GRAPH_VERSION?.trim() || "v27.0",
  };
}

function toPost(media: Media): HistoryPost | null {
  if (typeof media.timestamp !== "string" || !Number.isFinite(Date.parse(media.timestamp))) {
    return null;
  }
  const type: HistoryPost["type"] =
    media.media_product_type === "REELS"
      ? "Reel"
      : media.media_type === "CAROUSEL_ALBUM"
        ? "Carousel"
        : media.media_type === "VIDEO"
          ? "Video"
          : "Photo";
  return {
    postedAt: new Date(media.timestamp).toISOString(),
    type,
    likes: typeof media.like_count === "number" ? Math.max(0, media.like_count) : null,
    comments: Math.max(0, media.comments_count ?? 0),
    views: typeof media.view_count === "number" ? Math.max(0, media.view_count) : null,
  };
}

// Pages back through an account's posts with Business Discovery until a year is
// covered, 150 posts are read, or the time budget runs out. Returns null when
// the lookup is not configured or Instagram refuses (personal accounts).
export async function fetchPostHistory(
  username: string,
  { budgetMs = 9_000, now = Date.now() }: { budgetMs?: number; now?: number } = {},
): Promise<HistoryPost[] | null> {
  const { token, accountId, version } = config();
  if (!token || !accountId || !/^[a-z0-9._]{1,30}$/.test(username)) {
    return null;
  }
  const deadline = Date.now() + budgetMs;
  const cutoff = now - HISTORY_DAYS * DAY_MS;
  const posts: HistoryPost[] = [];
  let after: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const remaining = deadline - Date.now();
    if (remaining < 1_000) {
      break;
    }
    const media = after ? `media.after(${after}).limit(${PAGE_SIZE})` : `media.limit(${PAGE_SIZE})`;
    const url = new URL(`https://graph.facebook.com/${version}/${accountId}`);
    url.searchParams.set("fields", `business_discovery.username(${username}){${media}{${FIELDS}}}`);
    let data: Response;
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(Math.min(remaining, 8_000)),
      });
      data = (await response.json()) as Response;
      if (!response.ok || data.error) {
        log.warn("post history page rejected", {
          username,
          page,
          code: data.error?.code ?? response.status,
        });
        return page === 0 ? null : posts;
      }
    } catch (error) {
      log.warn("post history page failed", {
        username,
        page,
        message: error instanceof Error ? error.message : "network",
      });
      return page === 0 ? null : posts;
    }

    const batch = (data.business_discovery?.media?.data ?? [])
      .map(toPost)
      .filter((post): post is HistoryPost => post !== null);
    posts.push(...batch);
    after = data.business_discovery?.media?.paging?.cursors?.after;
    const oldest = batch.at(-1);
    if (!after || batch.length === 0 || (oldest && Date.parse(oldest.postedAt) < cutoff)) {
      break;
    }
  }

  return posts.filter((post) => Date.parse(post.postedAt) >= cutoff);
}
