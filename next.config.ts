import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  experimental: {
    // Document uploads (knowledge base and help center imports) are sent to
    // server actions; files are capped at 4 MB in parse-file.ts.
    serverActions: { bodySizeLimit: "5mb" },
  },
  // pdf.js (via unpdf) must be loaded from node_modules at runtime.
  serverExternalPackages: ["unpdf", "mammoth"],
};

export default nextConfig;
