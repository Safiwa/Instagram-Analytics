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
  fakeFollowers?: number;
  followerHistory: MonthlyPoint[];
  recentPosts: Post[];
  audience?: Audience;
};
