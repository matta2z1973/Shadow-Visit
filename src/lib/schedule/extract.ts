import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { Token } from "./types";

export async function extractTokens(pdf: Uint8Array): Promise<Token[]> {
  const doc = await getDocument({
    data: pdf,
    useSystemFonts: true,
  }).promise;

  const tokens: Token[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const str = item.str.trim();
      if (!str) continue;
      const transform = item.transform as number[];
      tokens.push({
        page: p,
        x: Math.round(transform[4] * 10) / 10,
        y: Math.round(transform[5] * 10) / 10,
        w: Math.round(item.width * 10) / 10,
        str,
      });
    }
  }
  return tokens;
}

const TIME_RANGE = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\*?$/;

export function parseTimeRange(
  raw: string,
): { start: string; end: string } | null {
  const m = raw.match(TIME_RANGE);
  if (!m) return null;
  // School schedules use 12h with implied AM (8:00, 9:00) or PM (1:00, 2:00).
  // Heuristic: a "later" hour that's <= the prior is PM. We resolve below by
  // tracking context, but for the bare string we apply a simple rule:
  //   8..11 → AM ; 12..7 (same hour or smaller than prior) → PM
  // Caller is responsible for any wraparound adjustments.
  const startH = parseInt(m[1], 10);
  const startM = m[2];
  const endH = parseInt(m[3], 10);
  const endM = m[4];

  const toIso = (h: number, mm: string, isPm: boolean) => {
    let hh = h % 12;
    if (isPm) hh += 12;
    return `${String(hh).padStart(2, "0")}:${mm}:00`;
  };

  // Schedule-domain heuristic: hours 8..11 are AM; hours 12 are PM noon;
  // hours 1..7 are PM. We assume end hour is on the same side as start unless
  // start is in the morning and end < start, which means end crossed noon.
  const startPm = startH < 8 || startH === 12;
  let endPm = endH < 8 || endH === 12;
  if (!startPm && endH < startH) endPm = true;

  return { start: toIso(startH, startM, startPm), end: toIso(endH, endM, endPm) };
}

// Group tokens that are visually on the same row (within a small y tolerance).
export function groupRows(tokens: Token[], yTolerance = 3): Token[][] {
  const sorted = [...tokens].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Token[][] = [];
  for (const t of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last[0].y - t.y) <= yTolerance) {
      last.push(t);
    } else {
      rows.push([t]);
    }
  }
  for (const row of rows) row.sort((a, b) => a.x - b.x);
  return rows;
}
