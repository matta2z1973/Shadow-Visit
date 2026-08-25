// Parses a Blackbaud "Student Schedule for the Day" CSV (one host, one date).
//
// Shape of the export (see fixtures): a couple of title rows carrying the date
// and the student's name + grade, a header row
// (Course, Start Time, End Time, Room, Block, Teacher), the day's blocks, then
// a "Page -N of M" footer. Cells can be quoted and contain embedded newlines
// and commas, so we parse RFC-4180 style rather than splitting on commas.
import { splitCommaName } from "../names";

export type ParsedHostBlock = {
  blockLabel: string; // "E Block", "Lunch", "HOH"
  courseTitle: string | null;
  courseCode: string | null; // "U5470-1"
  startTime: string; // "HH:MM:SS"
  endTime: string; // "HH:MM:SS"
  room: string | null;
  teacher: string | null;
  isAcademic: boolean;
};

export type ParsedHostSchedule = {
  studentName: string | null; // "Joshi, Ayaana"
  firstName: string | null; // "Ayaana"
  lastName: string | null; // "Joshi"
  gradYear: number | null; // 2028
  grade: number | null; // 11
  date: string | null; // "YYYY-MM-DD"
  dayType: "green" | "gold" | null;
  blocks: ParsedHostBlock[];
  warnings: string[];
};

// --- RFC-4180-ish CSV tokenizer (handles quotes, escaped quotes, newlines) ---
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const s = text.replace(/\r\n?/g, "\n"); // normalize newlines

  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // flush last field/row
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

// "8:30 AM" -> "08:30:00", "1:26 PM" -> "13:26:00"
export function parseClockTime(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const mer = m[3].toUpperCase();
  if (mer === "PM" && h !== 12) h += 12;
  if (mer === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`;
}

// "2/18/2026" -> "2026-02-18"
function parseUsDate(raw: string): string | null {
  const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, mo, da, yr] = m;
  return `${yr}-${mo.padStart(2, "0")}-${da.padStart(2, "0")}`;
}

// "AP Physics 1 (U5470-1)" -> { title: "AP Physics 1", code: "U5470-1" }
function splitCourse(raw: string): { title: string | null; code: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { title: null, code: null };
  const m = trimmed.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) return { title: m[1].trim() || null, code: m[2].trim() || null };
  return { title: trimmed, code: null };
}

export const ACADEMIC_BLOCK = /^([A-H])\s*Block$/i;

const HEADER = ["course", "start time", "end time", "room", "block", "teacher"];

function isHeaderRow(cells: string[]): boolean {
  const norm = cells.map((c) => c.trim().toLowerCase());
  return HEADER.every((h, idx) => norm[idx] === h);
}

export function parseHostScheduleCsv(text: string): ParsedHostSchedule {
  const warnings: string[] = [];
  const rows = parseCsv(text);

  let date: string | null = null;
  let studentName: string | null = null;
  let gradYear: number | null = null;
  let grade: number | null = null;
  let headerIdx = -1;

  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r];
    const joined = cells.join(" ");

    if (!date) {
      const d = joined.includes("Schedule for the Day")
        ? parseUsDate(joined)
        : null;
      if (d) date = d;
    }
    if (grade === null) {
      const gm = joined.match(/Grade:\s*(\d{1,2})/i);
      if (gm) grade = parseInt(gm[1], 10);
    }
    if (!studentName) {
      // Name cell looks like: Joshi, Ayaana '28
      const nm = cells[0]?.match(/^\s*([^']+?)\s*'(\d{2})\s*$/);
      if (nm) {
        studentName = nm[1].replace(/\s+/g, " ").trim();
        gradYear = 2000 + parseInt(nm[2], 10);
      }
    }
    if (isHeaderRow(cells)) {
      headerIdx = r;
      break;
    }
  }

  const split = studentName ? splitCommaName(studentName) : { first: "", last: "" };
  const firstName = studentName ? split.first || null : null;
  const lastName = studentName ? split.last || null : null;

  if (headerIdx === -1) {
    warnings.push("Could not find the Course/Start Time/... header row.");
    return { studentName, firstName, lastName, gradYear, grade, date, dayType: null, blocks: [], warnings };
  }
  if (!date) warnings.push("Could not read the schedule date.");

  const blocks: ParsedHostBlock[] = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const cells = rows[r];
    const first = (cells[0] ?? "").trim();
    if (!first) continue;
    if (/^Page\b/i.test(first)) break; // footer

    const start = parseClockTime(cells[1] ?? "");
    const end = parseClockTime(cells[2] ?? "");
    if (!start || !end) continue; // not a real block row

    const blockLabel = (cells[4] ?? "").trim();
    const { title, code } = splitCourse(first);
    const isAcademic = ACADEMIC_BLOCK.test(blockLabel);

    blocks.push({
      blockLabel: blockLabel || first,
      courseTitle: title,
      courseCode: code,
      startTime: start,
      endTime: end,
      room: (cells[3] ?? "").trim() || null,
      teacher: (cells[5] ?? "").trim() || null,
      isAcademic,
    });
  }

  // Infer green vs gold from which academic blocks are present.
  let dayType: "green" | "gold" | null = null;
  for (const b of blocks) {
    const m = b.blockLabel.match(ACADEMIC_BLOCK);
    if (!m) continue;
    const letter = m[1].toUpperCase();
    if ("ABCD".includes(letter)) dayType = "green";
    else if ("EFGH".includes(letter)) dayType = "gold";
    if (dayType) break;
  }
  if (blocks.length === 0) warnings.push("No schedule blocks found.");

  return { studentName, firstName, lastName, gradYear, grade, date, dayType, blocks, warnings };
}
