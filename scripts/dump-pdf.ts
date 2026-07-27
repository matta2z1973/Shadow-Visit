import { readFileSync } from "node:fs";

// Minimal polyfills so pdfjs' legacy build loads in a bare Node script
// (text extraction doesn't actually use these).
// @ts-ignore
globalThis.DOMMatrix ||= class { constructor() {} };
// @ts-ignore
globalThis.ImageData ||= class { constructor() {} };
// @ts-ignore
globalThis.Path2D ||= class { constructor() {} };

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage: tsx scripts/dump-pdf.ts <file.pdf>");
  // @ts-ignore
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(readFileSync(file));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    console.log(`\n===== PAGE ${p} =====`);
    for (const item of content.items) {
      const it = item as { transform: number[]; str?: string; width?: number };
      const x = Math.round(it.transform[4]);
      const y = Math.round(it.transform[5]);
      const s = (it.str ?? "").replace(/\s+$/, "");
      if (s.trim() === "") continue;
      console.log(`x=${x}\ty=${y}\t${JSON.stringify(s)}`);
    }
  }
}
main();
