// Turns an uploaded FinalSite report — .xlsx, legacy .xls, or .csv — into the
// plain grid of cells parseProspectiveReportRows expects. Every format goes
// through here so they can't drift apart.
import * as XLSX from "xlsx";

export const REPORT_FILE_EXTENSIONS = [".xlsx", ".xls", ".csv"] as const;

type Cell = string | number | null;

export function isSupportedReportFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return REPORT_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// "Oct 14, 2026" — the shape parseHumanDate reads. Built from the date's own
// calendar fields: SheetJS hands back a local-midnight Date for a date cell,
// so a toISOString() here would shift it a day for anyone west of UTC.
function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// CSVs saved from Excel on Windows are usually Windows-1252, not UTF-8; read
// as UTF-8 that turns "José" into "Jos�". Try strict UTF-8 first and fall
// back, so a genuine UTF-8 file is never double-decoded.
function decodeText(bytes: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  // A leading byte-order mark would otherwise stick to the first header
  // ("﻿first_name") and stop it matching any column name.
  return text.replace(/^﻿/, "");
}

export function readReportFile(bytes: ArrayBuffer, fileName: string): Cell[][] {
  const isCsv = fileName.toLowerCase().endsWith(".csv");
  const workbook = isCsv
    ? // raw: no type guessing — keeps "09" as "09" and a date as the text
      // FinalSite wrote, instead of SheetJS's own reinterpretation of it.
      XLSX.read(decodeText(bytes), { type: "string", raw: true })
    : XLSX.read(bytes, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  // raw: true returns real values (numbers, Dates) rather than Excel's
  // display text, which for a date cell is "10/14/26" or similar depending on
  // the cell's format. Dates are then written out in one known shape.
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: false,
  });
  return rows.map((row) =>
    row.map((cell): Cell => {
      if (cell === null || cell === undefined) return null;
      if (cell instanceof Date) return isNaN(cell.getTime()) ? null : fmtDate(cell);
      if (typeof cell === "number") return cell;
      return String(cell);
    }),
  );
}
