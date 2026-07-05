// pdf2json's shipped .d.ts declares a named export `PDFParser`, but the
// actual compiled CJS module exports the parser class as the module's
// default export directly (verified against the installed package at
// runtime). This override makes the import match what actually exists.

declare module "pdf2json" {
  import { EventEmitter } from "node:events";

  interface PdfTextRun {
    T: string;
    S?: number;
    TS?: number[];
  }

  interface PdfTextItem {
    x: number;
    y: number;
    w?: number;
    R: PdfTextRun[];
  }

  interface PdfPage {
    Width: number;
    Height: number;
    Texts: PdfTextItem[];
  }

  interface PdfData {
    Pages: PdfPage[];
  }

  class PDFParser extends EventEmitter {
    constructor(context?: unknown, needRawText?: boolean, password?: string);
    parseBuffer(buffer: Buffer): void;
    on(event: "pdfParser_dataReady", listener: (data: PdfData) => void): this;
    on(event: "pdfParser_dataError", listener: (err: { parserError: unknown }) => void): this;
  }

  export = PDFParser;
}