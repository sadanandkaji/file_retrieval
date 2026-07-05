import type { NextConfig } from "next";

// No serverExternalPackages needed for pdfjs-dist/@napi-rs/canvas anymore —
// they're only used inside scripts/rasterize-pdf.mjs, which runs as a
// standalone child process, not as code Next bundles.
const nextConfig: NextConfig = {};

export default nextConfig;