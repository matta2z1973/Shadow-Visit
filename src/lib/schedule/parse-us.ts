import type { ExtractedBlock, ParseResult, Token } from "./types";
import { groupRows, parseTimeRange } from "./extract";

const TEACHING_LABELS = new Set(["A", "B", "C", "D", "E", "F", "G", "H"]);
const ADVISORY_LABELS = new Set(["Advisory"]);

// Heuristic: column header row contains "Green"/"Gold" tokens repeated 8 times.
function findColumnCenters(tokens: Token[]): number[] | null {
  const rows = groupRows(tokens);
  for (const row of rows) {
    const greens = row.filter((t) => /^(Green|Gold)$/.test(t.str));
    if (greens.length === 8) {
      return greens.map((t) => t.x + t.w / 2);
    }
  }
  return null;
}

function nearestColumn(x: number, centers: number[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < centers.length; i++) {
    const d = Math.abs(centers[i] - x);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

export function parseUsSchedule(tokens: Token[]): ParseResult {
  const warnings: string[] = [];
  const centers = findColumnCenters(tokens);
  if (!centers) {
    return {
      blocks: [],
      warnings: ["Could not locate Green/Gold column headers."],
    };
  }

  // Column index 0 = Green-1, 1 = Gold-2, 2 = Green-3, etc.
  // For block extraction we just need parity.
  const isGoldColumn = (i: number) => i % 2 === 1;

  const rows = groupRows(tokens);
  const blocks: ExtractedBlock[] = [];
  const seen = new Set<string>(); // dedupe (dayType, label)

  let sortOrder = 0;
  for (const row of rows) {
    // First token starting in the leftmost column (x < first center - margin)
    // is likely a time range, IF it parses as one.
    const leftmost = row.find((t) => t.x < centers[0] - 30);
    if (!leftmost) continue;
    const time = parseTimeRange(leftmost.str);
    if (!time) continue;

    // For each of the 8 columns, take tokens whose center falls within that
    // column's bin. (Token center: t.x + t.w/2, but using just t.x is fine
    // since cells are wide and start near column-left.)
    const cells: string[] = Array(centers.length).fill("");
    for (const t of row) {
      if (t === leftmost) continue;
      const ci = nearestColumn(t.x, centers);
      cells[ci] = cells[ci] ? `${cells[ci]} ${t.str}` : t.str;
    }

    // Identify what kind of row this is.
    // Teaching-block rows have a single capital letter A-H in each cell.
    // Advisory rows have "Advisory" in each Green column.
    // Everything else (passing period, dismissal, lunch, etc.) → skip.
    const greens = cells.filter((_, i) => !isGoldColumn(i));
    const golds = cells.filter((_, i) => isGoldColumn(i));

    const greensAllTeaching =
      greens.every((c) => TEACHING_LABELS.has(c)) &&
      new Set(greens).size === 1;
    const goldsAllTeaching =
      golds.every((c) => TEACHING_LABELS.has(c)) && new Set(golds).size === 1;
    const greensAllAdvisory =
      greens.every((c) => ADVISORY_LABELS.has(c)) &&
      new Set(greens).size === 1;

    if (greensAllTeaching && goldsAllTeaching) {
      const greenLabel = greens[0];
      const goldLabel = golds[0];
      pushBlock("green", greenLabel);
      pushBlock("gold", goldLabel);
    } else if (greensAllAdvisory) {
      // Advisory row: only Green columns hold "Advisory". Gold columns vary
      // (Office Hours, Club I/II/III). We deliberately skip the variable
      // Gold cells per project decision.
      pushBlock("green", greens[0]);
    } else {
      // Skip silently — not a coverable row.
    }

    function pushBlock(dayType: "green" | "gold", label: string) {
      const key = `${dayType}|${label}`;
      if (seen.has(key)) return;
      seen.add(key);
      blocks.push({
        cohortCode: "US",
        dayType,
        label,
        startTime: time!.start,
        endTime: time!.end,
        sortOrder: sortOrder++,
        isCoverable: true,
      });
    }
  }

  if (blocks.length === 0) warnings.push("No blocks extracted.");
  return { blocks, warnings };
}
