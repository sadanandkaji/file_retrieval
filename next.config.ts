import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    // key = glob matching the route(s) that call rasterizePdf
    "app/api/**/route": [
      "./scripts/rasterize-pdf.mjs",
      "./node_modules/@napi-rs/canvas/**",
      "./node_modules/pdfjs-dist/**",
    ],
  },
};

export default nextConfig;