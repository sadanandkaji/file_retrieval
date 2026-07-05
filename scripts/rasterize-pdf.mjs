#!/usr/bin/env node
// Deliberately plain ESM JS, not TypeScript, and deliberately NOT imported
// anywhere in the Next.js app. It's invoked as a child process at runtime
// (see lib/pdfToImages.ts), so it's never part of Next's/Turbopack's module
// graph and never gets bundled. That's what avoids the dynamic-import-vs-
// externalization conflict pdfjs-dist otherwise hits under Next 16.

import { createCanvas } from "@napi-rs/canvas";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFile } from "fs/promises";

async function main() {
  const [, , pdfPath, scaleArg] = process.argv;
  if (!pdfPath) {
    throw new Error("Usage: node rasterize-pdf.mjs <pdfPath> [scale]");
  }
  const scale = scaleArg ? parseFloat(scaleArg) : 2;

  const buffer = await readFile(pdfPath);
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const doc = await loadingTask.promise;

  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext("2d");
    await page.render({ canvasContext: context, viewport }).promise;

    pages.push({
      pageNumber: i,
      base64Png: canvas.toBuffer("image/png").toString("base64"),
    });
  }

  if (typeof doc.destroy === "function") {
    await doc.destroy();
  }

  // Single JSON blob on stdout; the parent process reads and parses it.
  process.stdout.write(JSON.stringify({ pages }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
