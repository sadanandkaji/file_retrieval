import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, mkdtemp, rmdir } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const execFileAsync = promisify(execFile);

export type PageImage = {
  pageNumber: number;
  base64Png: string;
};

/**
 * Rasterizes every page of a PDF buffer into PNG images by running
 * scripts/rasterize-pdf.mjs in a standalone Node child process, rather than
 * importing pdfjs-dist directly into this route.
 *
 * Why: pdfjs-dist's Node fallback ("fake worker") does a dynamic import()
 * of its own worker file at runtime. When this module is bundled by Next's
 * server bundler, that breaks two different ways depending on config —
 * either the physical worker file can't be found post-bundling, or (if you
 * mark pdfjs-dist external to fix that) Turbopack refuses because a
 * require() of an ESM file is invalid. There's no in-process fix for this
 * combination as of Next 16 + pdfjs-dist's ESM-only builds. Running it as
 * a separate, unbundled process sidesteps the problem entirely — the
 * script is invoked at runtime, not statically imported, so it's never
 * part of Next's module graph.
 *
 * Install: npm install pdfjs-dist @napi-rs/canvas
 * (you can remove pdf-to-img, it's no longer used)
 */
export async function rasterizePdf(buffer: Buffer, scale = 2): Promise<PageImage[]> {
  const dir = await mkdtemp(path.join(tmpdir(), "pdf-rasterize-"));
  const pdfPath = path.join(dir, "input.pdf");
  await writeFile(pdfPath, buffer);

  const scriptPath = path.join(process.cwd(), "scripts", "rasterize-pdf.mjs");

  if (!existsSync(scriptPath)) {
    throw new Error(
      `rasterize-pdf.mjs not found at ${scriptPath}. It must live at ` +
        `<project root>/scripts/rasterize-pdf.mjs (sibling to package.json). ` +
        `process.cwd() was: ${process.cwd()}`
    );
  }

  try {
    const { stdout } = await execFileAsync(
      process.execPath, // run with whatever Node binary is already running
      [scriptPath, pdfPath, String(scale)],
      { maxBuffer: 1024 * 1024 * 200 } // base64 page images can be large
    );
    const parsed = JSON.parse(stdout);
    return parsed.pages as PageImage[];
  } finally {
    await unlink(pdfPath).catch(() => {});
    await rmdir(dir).catch(() => {});
  }
}