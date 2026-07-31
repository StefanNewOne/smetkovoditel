import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lean production image: emit .next/standalone (server + traced deps) for the Docker runtime.
  output: "standalone",
  // Workspace packages are shipped as TypeScript source — let Next transpile them.
  transpilePackages: ["@smetko/db", "@smetko/shared"],
  // @react-pdf/renderer must stay a Node external (fonts, yoga wasm) — do not bundle it.
  serverExternalPackages: ["@react-pdf/renderer", "pdf-parse", "xlsx"],
  // Ship the bundled Cyrillic fonts with the invoice PDF route in a traced/standalone build.
  outputFileTracingIncludes: {
    "/charges/[id]/invoice": ["./assets/fonts/**/*"],
  },
  experimental: {
    // Room for bulk PDF uploads (many Meta receipts / statements) + a W6 camera photo.
    serverActions: { bodySizeLimit: "50mb" },
  },
};

export default nextConfig;
