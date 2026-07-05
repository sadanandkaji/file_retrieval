// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/ingest": [
      "./scripts/rasterize-pdf.mjs",
      "./node_modules/@napi-rs/canvas/**",
      "./node_modules/pdfjs-dist/**",
    ],
  },
};

export default nextConfig;