export type Post = {
  id: string;
  type: "Reel" | "Carousel" | "Photo" | "Video";
  caption: string;
  postedAt: string;
  likes: number;
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
  isPrivate?: boolean;
  source: "demo" | "public" | "live";
  profilePictureUrl?: string;
  website?: string;
  // Instagram's "Account based in" value only when the platform actually
  // publishes it. "Not shared" and unavailable values stay null/undefined.
  accountCountry?: string | null;
  fakeFollowers?: number;
  followerHistory: MonthlyPoint[];
  recentPosts: Post[];
  audience?: Audience;
  thirdPartyEngagement?: ThirdPartyEngagement;
};
