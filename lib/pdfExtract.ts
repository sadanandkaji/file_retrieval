// lib/pdfExtract.ts
//
// pdfjs-dist's bundling under Next.js/Turbopack is currently broken (open
// Vercel/Next.js Turbopack issues — its dynamic worker loading and ESM-only
// build confuse the bundler's static analysis even when marked as a server
// external package). pdf2json is plain CommonJS with no worker and no
// browser-only APIs, so it bundles cleanly. It gives us what we actually
// need: per-text-run x/y coordinates, which is what lets us tell table
// columns (e.g. Mobile.pdf's label/value layout) apart from flowing
// paragraph text (e.g. Laptop Bag.pdf's linear layout).
//
// Note: pdf2json's own `w` (width) field is unreliable for many text runs
// (verified empirically against real files — some values are wildly larger
// than the page itself), so column-gap detection here deliberately uses
// only the gap between consecutive items' x-start positions, not width.

import PDFParser from "pdf2json";

type TextRun = {
  text: string;
  x: number;
  y: number;
};

type ExtractedPage = {
  pageNumber: number;
  text: string;
};

const ROW_Y_TOLERANCE = 0.3; // pdf2json y-units; groups items into the same visual line
const COLUMN_GAP_FRACTION = 0.03; // x-gap > 3% of page width => treat as a new table column

function decodeRunText(run: { R: { T: string }[] }): string {
  // pdf2json URI-encodes each text run's characters.
  return run.R.map((r) => decodeURIComponent(r.T)).join("");
}

function reconstructPage(texts: { x: number; y: number; R: { T: string }[] }[], pageWidth: number): string {
  const items: TextRun[] = texts
    .map((t) => ({ text: decodeRunText(t), x: t.x, y: t.y }))
    .filter((it) => it.text.trim().length > 0);

  if (items.length === 0) return "";

  // pdf2json's y increases downward; sort top-to-bottom, then left-to-right.
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);

  const rows: TextRun[][] = [];
  let currentRow: TextRun[] = [];
  let currentY: number | null = null;

  for (const item of sorted) {
    if (currentY === null || Math.abs(item.y - currentY) <= ROW_Y_TOLERANCE) {
      currentRow.push(item);
      currentY = currentY === null ? item.y : currentY;
    } else {
      rows.push(currentRow);
      currentRow = [item];
      currentY = item.y;
    }
  }
  if (currentRow.length) rows.push(currentRow);

  const gapThreshold = pageWidth * COLUMN_GAP_FRACTION;
  const lines: string[] = [];

  for (const row of rows) {
    const rowSorted = [...row].sort((a, b) => a.x - b.x);
    let line = "";
    let prevX: number | null = null;

    for (const item of rowSorted) {
      if (prevX !== null && item.x - prevX > gapThreshold) {
        // Big horizontal jump on the same visual row = a different table
        // cell (e.g. label column vs. content column). Mark it explicitly
        // instead of silently concatenating, which is what caused labels
        // like "Data Card" to glue onto the wrong paragraph before.
        line += " || ";
      }
      line += item.text;
      prevX = item.x;
    }
    lines.push(line.trim());
  }

  return lines.join("\n");
}

export async function extractPdfWithLayout(buffer: Buffer): Promise<{
  fullText: string;
  pages: ExtractedPage[];
}> {
  const pdfData = await new Promise<{ Pages: { Width: number; Texts: { x: number; y: number; R: { T: string }[] }[] }[] }>(
    (resolve, reject) => {
      const parser = new PDFParser();
      parser.on("pdfParser_dataError", (err) => reject(err.parserError ?? err));
      parser.on("pdfParser_dataReady", (data) => resolve(data as any));
      parser.parseBuffer(buffer);
    }
  );

  const pages: ExtractedPage[] = pdfData.Pages.map((page, idx) => ({
    pageNumber: idx + 1,
    text: reconstructPage(page.Texts, page.Width),
  }));

  const fullText = pages
    .map((p) => `--- PAGE ${p.pageNumber} ---\n${p.text}`)
    .join("\n\n");

  return { fullText, pages };
}