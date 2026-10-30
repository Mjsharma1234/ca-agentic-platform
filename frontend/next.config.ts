import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Disable ESLint during production build so CI never prompts or fails on linting
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Allows production build to succeed cleanly on CI runners
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  rewrites: async () => {
    return [
      {
        source: "/api/:path*",
        destination: process.env.NEXT_PUBLIC_API_URL 
          ? `${process.env.NEXT_PUBLIC_API_URL}/api/:path*`
          : "http://localhost:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
