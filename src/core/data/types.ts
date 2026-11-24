import type { FollowerSample } from "../analytics/followerAudit";

export type Post = {
  id: string;
  type: "Reel" | "Carousel" | "Photo" | "Video";
  caption: string;
  postedAt: string;
  likes: number;
  // True when Instagram hides this post's like count (common on paid
  // partnerships). `likes` is then 0 and must not be read as zero likes.
  likesHidden?: boolean;
  comments: number;
  saves?: number;
  reach?: number;
  viewCount?: number;
  permalink?: string;
  hashtags: string[];
  // Public location tag exposed by Instagram on the post/reel, when available.
  location?: string;
};

export type MonthlyPoint = {
  month: string;
  followers: number;
};

// One stored daily snapshot from the in-house database (UTC day, YYYY-MM-DD).
// engagementRate is null on days when no posts were visible.
export type DailyPoint = {
  date: string;
  followers: number;
  engagementRate: number | null;
};

export type TrackingHistory = {
  // UTC day of the first stored snapshot for this profile.
  since: string;
  points: DailyPoint[];
};

export type AudienceSlice = {
  label: string;
  percentage: number;
};

export type Audience = {
  topCountries: AudienceSlice[];
  ageGroups: AudienceSlice[];
  gender: AudienceSlice[];
};

// A disclosed third-party estimate used only when Instagram exposes no posts.
// It is never treated as an Instagram measurement and never feeds the modeled
// fake-follower, authenticity, or growth calculations.
export type ThirdPartyEngagement = {
  source: string;
  sourceUrl: string;
  reportUpdatedAt: string;
  engagementRatePct: number;
  averageLikes: number;
  averageComments: number;
};

export type CreatorProfile = {
  username: string;
  displayName: string;
  category: string;
  bio: string;
  followers: number;
  following: number;
  postsCount: number;
  isVerified: boolean;
  // True when the data source could not tell whether the badge exists
  // (Business Discovery never returns it). isVerified is then false.
  verificationUnknown?: boolean;
  isPrivate?: boolean;
  source: "demo" | "public" | "live";
  profilePictureUrl?: string;
  website?: string;
  // Instagram's "Account based in" value only when the platform actually
  // publishes it. "Not shared" and unavailable values stay null/undefined.
  accountCountry?: string | null;
  fakeFollowers?: number;
  followerHistory: MonthlyPoint[];
  // Daily snapshots stored by this site since it first saw the profile.
  // Absent when the database is not configured or has no rows yet.
  tracking?: TrackingHistory;
  recentPosts: Post[];
  // A random sample of the account's followers, when a data source supplies
  // one. Instagram's API cannot list another account's followers, so this is
  // usually absent and fake followers fall back to the profile-level model.
  followerSample?: FollowerSample[];
  audience?: Audience;
  thirdPartyEngagement?: ThirdPartyEngagement;
};
