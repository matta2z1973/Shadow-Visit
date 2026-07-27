import { readFileSync } from "node:fs";
// @ts-ignore
globalThis.DOMMatrix ||= class { constructor() {} };
// @ts-ignore
globalThis.ImageData ||= class { constructor() {} };
// @ts-ignore
globalThis.Path2D ||= class { constructor() {} };
import type { Token } from "../src/lib/schedule/types";
import { parseInterviewVisitForm } from "../src/lib/finalsite/parse-form-pdf";

async function main() {
  const file = process.argv[2];
  // @ts-ignore
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), useSystemFonts: true }).promise;
  const tokens: Token[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const item of content.items) {
      const it = item as { transform: number[]; str?: string; width?: number };
      const str = (it.str ?? "").trim();
      if (!str) continue;
      tokens.push({ page: p, x: Math.round(it.transform[4]*10)/10, y: Math.round(it.transform[5]*10)/10, w: Math.round((it.width??0)*10)/10, str });
    }
  }
  const parsed = parseInterviewVisitForm(tokens);
  console.log(JSON.stringify(parsed, null, 2));
}
main();
