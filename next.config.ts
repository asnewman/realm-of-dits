import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The route handler reads the reference PNG off disk, so it has to be traced
  // into the serverless bundle. Files in public/ are not included by default.
  outputFileTracingIncludes: {
    "/api/generate": ["./public/dits/thedit.png"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.public.blob.vercel-storage.com",
      },
    ],
  },
};

export default nextConfig;
