import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Instagram serves public avatars from its CDN. Only those hosts are
    // allowed through the image optimizer for the searched profile picture.
    remotePatterns: [
      { protocol: "https", hostname: "**.cdninstagram.com", pathname: "/**" },
      { protocol: "https", hostname: "**.fbcdn.net", pathname: "/**" },
      { protocol: "https", hostname: "scontent-*.instagram.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;
