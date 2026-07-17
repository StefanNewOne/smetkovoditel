import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages are shipped as TypeScript source — let Next transpile them.
  transpilePackages: ["@smetko/db", "@smetko/shared"],
  experimental: {
    // The Prisma client is a server-only external.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
