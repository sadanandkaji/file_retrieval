// types/pdfjs-dist-legacy.d.ts
//
// pdfjs-dist ships its legacy build as pdf.mjs with a matching pdf.d.mts,
// but under moduleResolution: "node" TypeScript won't map a deep ".mjs"
// import path to its ".d.mts" declaration file, so the import errors with
// "Cannot find module ... or its corresponding type declarations" even
// though it resolves and runs fine at runtime (verified directly against
// the installed package). This ambient declaration gives TS a type for the
// same path without needing to change moduleResolution project-wide.

declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  export interface PdfjsTextItem {
    str: string;
    transform: number[];
    width: number;
    height: number;
    [key: string]: unknown;
  }

  export interface PdfjsTextContent {
    items: PdfjsTextItem[];
  }

  export interface PdfjsPage {
    getTextContent(): Promise<PdfjsTextContent>;
  }

  export interface PdfjsDocument {
    numPages: number;
    getPage(pageNumber: number): Promise<PdfjsPage>;
  }

  export function getDocument(src: { data: Uint8Array }): {
    promise: Promise<PdfjsDocument>;
  };

  export const version: string;
}