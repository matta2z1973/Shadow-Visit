// Parses FinalSite's bulk prospective-student report (one row per
// applicant, exported as .xlsx). Sample columns observed:
//   First | middle_name | Last | name_suffix | Preferred | Grade | Date |
//   Current School | Interest 1 | Interest 2 | Interest 3 | Interest 4
//
// The four "Interest N" columns are NOT four independent interests — they're
// two (level, name) pairs: Interest 1/3 hold a proficiency word ("Advanced",
// "Beginner", "Intermediate", "Haven't tried yet") and Interest 2/4 hold the
// actual interest name ("Math Club", "Lacrosse (boys/girls)", ...). Confirmed
// against src/lib/seed-interests.ts, which every "name" value matches exactly.
//
// Note: this report has no Gender column (unlike the PDF Interview & Visit
// Form), and the Date column bundles a visit-time range that today's schema
// has nowhere to store per-prospective (only a bare `shadow_date`) — both are
// surfaced as warnings rather than silently dropped.
import { parseGrade, parseHumanDate } from "./parse-form-pdf";

export type ParsedInterestPick = {
  name: string;
  level: string | null;
  priority: number; // 1 = highest (first pair encountered)
};

export type ParsedProspectiveRow = {
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  nameSuffix: string | null;
  preferredName: string | null;
  fullName: string | null;
  gradeRaw: string | null;
  grade: number | null;
  currentSchool: string | null;
  visitDateRaw: string | null;
  visitDate: string | null; // YYYY-MM-DD
  visitStart: string | null; // HH:MM:SS
  visitEnd: string | null; // HH:MM:SS
  interests: ParsedInterestPick[];
  warnings: string[];
};

export type ParsedProspectiveReport = {
  rows: ParsedProspectiveRow[];
  warnings: string[]; // report-level (e.g. missing expected column)
};

type Cell = string | number | null | undefined;

const COLUMN_ALIASES: Record<string, string> = {
  first: "first",
  middle_name: "middle",
  "middle name": "middle",
  last: "last",
  name_suffix: "suffix",
  suffix: "suffix",
  preferred: "preferred",
  grade: "grade",
  date: "date",
  "current school": "school",
  "interest 1": "interest1",
  "interest 2": "interest2",
  "interest 3": "interest3",
  "interest 4": "interest4",
};

function normHeader(raw: Cell): string {
  return String(raw ?? "").trim().toLowerCase();
}

function cellStr(raw: Cell): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s || null;
}

function buildColumnMap(headerRow: Cell[]): {
  map: Record<string, number>;
  warnings: string[];
} {
  const map: Record<string, number> = {};
  headerRow.forEach((cell, idx) => {
    const key = COLUMN_ALIASES[normHeader(cell)];
    if (key) map[key] = idx;
  });
  const required = ["first", "last", "grade", "date"];
  const warnings = required
    .filter((k) => !(k in map))
    .map((k) => `Missing expected column for "${k}".`);
  return { map, warnings };
}

export function parseProspectiveReportRows(
  rows: Cell[][],
): ParsedProspectiveReport {
  if (rows.length === 0) {
    return { rows: [], warnings: ["Sheet is empty."] };
  }
  const { map, warnings: headerWarnings } = buildColumnMap(rows[0]);
  const get = (row: Cell[], key: string): Cell =>
    key in map ? row[map[key]] : undefined;

  const parsed: ParsedProspectiveRow[] = [];
  for (const row of rows.slice(1)) {
    if (row.every((c) => c === null || c === undefined || String(c).trim() === ""))
      continue; // skip fully blank rows

    const warnings: string[] = [];
    const firstName = cellStr(get(row, "first"));
    const middleName = cellStr(get(row, "middle"));
    const lastName = cellStr(get(row, "last"));
    const nameSuffix = cellStr(get(row, "suffix"));
    const preferredName = cellStr(get(row, "preferred"));
    const currentSchool = cellStr(get(row, "school"));

    const gradeRaw = cellStr(get(row, "grade"));
    const grade = parseGrade(gradeRaw);

    const visitDateRaw = cellStr(get(row, "date"));
    const { date: visitDate, start: visitStart, end: visitEnd } =
      parseHumanDate(visitDateRaw);

    const interests: ParsedInterestPick[] = [];
    const pairs: [string, string][] = [
      ["interest1", "interest2"],
      ["interest3", "interest4"],
    ];
    pairs.forEach(([levelKey, nameKey], i) => {
      const level = cellStr(get(row, levelKey));
      const name = cellStr(get(row, nameKey));
      if (!name) {
        if (level) warnings.push(`Interest level "${level}" has no paired interest name — skipped.`);
        return;
      }
      interests.push({ name, level, priority: i + 1 });
    });

    if (!firstName && !lastName) warnings.push("Could not read a first or last name.");
    if (!gradeRaw) warnings.push("Could not read grade.");
    if (!visitDate) warnings.push(`Could not parse a visit date from "${visitDateRaw ?? ""}".`);

    const displayFirst = preferredName || firstName;
    const fullName =
      displayFirst || lastName
        ? [displayFirst, lastName].filter(Boolean).join(" ")
        : null;

    parsed.push({
      firstName,
      middleName,
      lastName,
      nameSuffix,
      preferredName,
      fullName,
      gradeRaw,
      grade,
      currentSchool,
      visitDateRaw,
      visitDate,
      visitStart,
      visitEnd,
      interests,
      warnings,
    });
  }

  return { rows: parsed, warnings: headerWarnings };
}
