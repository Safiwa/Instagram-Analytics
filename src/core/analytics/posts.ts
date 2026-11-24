import type { Post } from "../data/types";

// A post's like count is unusable when Instagram hides it. Sources do not
// always flag this, so a post reporting 0 likes while it has comments or views
// is treated as hidden too: a public post with real reach never has zero likes.
export function likesVisible(post: Post): boolean {
  if (post.likesHidden) {
    return false;
  }
  return !(post.likes === 0 && (post.comments > 0 || (post.viewCount ?? 0) > 0));
}

export function postsWithVisibleLikes(posts: Post[]): Post[] {
  return posts.filter(likesVisible);
}

export function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

// Spread of a list as (Q3 - Q1) / median. Unlike the coefficient of variation
// it is not dominated by one viral post, so a single outlier cannot make an
// account look like it has unstable (bought) engagement.
export function quartileDispersion(values: number[]): number {
  if (values.length < 4) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = median(sorted);
  if (middle <= 0) {
    return 0;
  }
  const half = Math.floor(sorted.length / 2);
  const lower = median(sorted.slice(0, half));
  const upper = median(sorted.slice(sorted.length % 2 === 0 ? half : half + 1));
  return (upper - lower) / middle;
}
