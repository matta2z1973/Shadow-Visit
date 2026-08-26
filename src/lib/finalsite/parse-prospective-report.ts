// Parses FinalSite's bulk prospective-student report (one row per
// applicant, exported as .xlsx). Current columns (confirmed against a real
// updated sample 2026-08-26 — this report previously had no Gender column
// and generic "Interest 1-4" headers; FinalSite added explicit ones):
//   First | middle_name | Last | name_suffix | Gender | Preferred | Grade |
//   Date | Current School | Involvement 1 | Interest 1 | Involvement 2 |
//   Interest 2
//
// "Involvement N" holds a proficiency word ("Advanced", "Beginner", "Haven't
// tried yet") — per the user, this is not used anywhere and is intentionally
// ignored. Only "Interest N" (the actual interest name) is kept.
//
// The Date column bundles a visit-time range that today's schema has nowhere
// to store per-prospective... actually it does (shadow_start/shadow_end,
// added 2026-08-25) — see prospective-actions.ts for where it's used.
import { parseGrade, parseHumanDate } from "./parse-form-pdf";

export type ParsedInterestPick = {
  name: string;
  priority: number; // 1 = highest
};

export type ParsedProspectiveRow = {
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  nameSuffix: string | null;
  preferredName: string | null;
  fullName: string | null;
  gender: "M" | "F" | null;
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
  gender: "gender",
  preferred: "preferred",
  grade: "grade",
  date: "date",
  "current school": "school",
  "interest 1": "interest1",
  "interest 2": "interest2",
  // "Involvement 1"/"Involvement 2" (proficiency level) deliberately have no
  // mapping — the user confirmed that data isn't used.
};

function normHeader(raw: Cell): string {
  return String(raw ?? "").trim().toLowerCase();
}

function cellStr(raw: Cell): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s || null;
}

function parseGender(raw: string | null): "M" | "F" | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  if (s === "M" || s.startsWith("MALE")) return "M";
  if (s === "F" || s.startsWith("FEMALE")) return "F";
  return null;
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
    const gender = parseGender(cellStr(get(row, "gender")));
    const preferredName = cellStr(get(row, "preferred"));
    const currentSchool = cellStr(get(row, "school"));

    const gradeRaw = cellStr(get(row, "grade"));
    const grade = parseGrade(gradeRaw);

    const visitDateRaw = cellStr(get(row, "date"));
    const { date: visitDate, start: visitStart, end: visitEnd } =
      parseHumanDate(visitDateRaw);

    const interests: ParsedInterestPick[] = [];
    (["interest1", "interest2"] as const).forEach((key, i) => {
      const name = cellStr(get(row, key));
      if (name) interests.push({ name, priority: i + 1 });
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
      gender,
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
