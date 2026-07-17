import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages are shipped as TypeScript source — let Next transpile them.
  transpilePackages: ["@smetko/db", "@smetko/shared"],
  // @react-pdf/renderer must stay a Node external (fonts, yoga wasm) — do not bundle it.
  serverExternalPackages: ["@react-pdf/renderer"],
  // Ship the bundled Cyrillic fonts with the invoice PDF route in a traced/standalone build.
  outputFileTracingIncludes: {
    "/charges/[id]/invoice": ["./assets/fonts/**/*"],
  },
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
