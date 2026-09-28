// Parses FinalSite's bulk prospective-student report (one row per
// applicant, exported as .xlsx). Column headers have already changed across
// exports at least twice (first "First"/"Last", later "first_name"/
// "last_name", likely more variants to come) — COLUMN_ALIASES below lists
// every exact spelling seen so far, and FUZZY_KEYWORDS is a fallback for
// whatever comes next: a header not in the exact list is matched by
// substring against a short keyword list per field (e.g. any header
// containing "last" or "surname" is treated as the last-name column) rather
// than failing the whole upload over a renamed column.
//   First/first_name | middle_name | Last/last_name | name_suffix | Gender |
//   Preferred | Grade | Date | Current School | Involvement 1 | Interest 1 |
//   Involvement 2 | Interest 2
//
// "Involvement N" holds a proficiency word ("Advanced", "Beginner", "Haven't
// tried yet") — per the user, this is not used anywhere and is intentionally
// ignored. Only "Interest N" (the actual interest name) is kept.
//
// The Date column bundles a visit-time range, stored on
// shadow_start/shadow_end — see prospective-report-actions.ts for where
// this parser's output is used.
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
  warnings: string[]; // report-level and blocking (e.g. a required column is missing entirely)
  notes: string[]; // informational only — e.g. a column was matched by fuzzy guess, not an exact header
};

type Cell = string | number | null | undefined;

// Known exact header spellings seen across different exports of this report
// (FinalSite has changed these at least once already — see the file-level
// comment above). Checked first, case-insensitively, exact whitespace
// collapsed — cheap and unambiguous whenever a header happens to match one
// of these outright.
const COLUMN_ALIASES: Record<string, string> = {
  first: "first",
  first_name: "first",
  "first name": "first",
  firstname: "first",
  middle_name: "middle",
  "middle name": "middle",
  middlename: "middle",
  last: "last",
  last_name: "last",
  "last name": "last",
  lastname: "last",
  name_suffix: "suffix",
  suffix: "suffix",
  gender: "gender",
  sex: "gender",
  preferred: "preferred",
  preferred_name: "preferred",
  "preferred name": "preferred",
  grade: "grade",
  grade_level: "grade",
  "grade level": "grade",
  date: "date",
  visit_date: "date",
  "visit date": "date",
  shadow_date: "date",
  "shadow date": "date",
  "current school": "school",
  current_school: "school",
  school: "school",
  "interest 1": "interest1",
  interest_1: "interest1",
  interest1: "interest1",
  "interest 2": "interest2",
  interest_2: "interest2",
  interest2: "interest2",
  // "Involvement 1"/"Involvement 2" (proficiency level) deliberately have no
  // mapping — the user confirmed that data isn't used.
};

// Fallback for a column whose header didn't match any of the exact aliases
// above outright (a vendor rename, an extra word, different punctuation,
// etc.) — normalizes to letters+digits only and checks for a substring
// match either direction against a short list of keywords per field. This
// runs only for whichever fields the exact pass above didn't already find,
// so an exact alias always wins over a fuzzy one when both would apply.
const FUZZY_KEYWORDS: Record<string, string[]> = {
  first: ["first", "fname", "givenname"],
  middle: ["middle", "mname"],
  last: ["last", "lname", "surname", "familyname"],
  suffix: ["suffix"],
  gender: ["gender", "sex"],
  preferred: ["preferred", "nickname", "goesby", "calledname"],
  grade: ["grade"],
  date: ["date", "visit", "shadow"],
  school: ["school"],
  interest1: ["interest1", "interestone", "interesta"],
  interest2: ["interest2", "interesttwo", "interestb"],
};

function fuzzyNorm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Finds the best still-unclaimed header for `key` by substring match against
// FUZZY_KEYWORDS, preferring a header that isn't itself a near-match for a
// *different* field (e.g. "interest 1" shouldn't fuzzy-steal "interest 2"'s
// column) by requiring the candidate keyword or the header to fully contain
// the other, not just share a fragment.
function fuzzyFindColumn(
  headerRow: Cell[],
  claimed: Set<number>,
  key: string,
): number | null {
  const keywords = FUZZY_KEYWORDS[key];
  if (!keywords) return null;
  for (let idx = 0; idx < headerRow.length; idx++) {
    if (claimed.has(idx)) continue;
    const header = fuzzyNorm(String(headerRow[idx] ?? ""));
    if (!header) continue;
    for (const kw of keywords) {
      const needle = fuzzyNorm(kw);
      if (header === needle || header.includes(needle) || needle.includes(header)) {
        return idx;
      }
    }
  }
  return null;
}

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
  warnings: string[]; // blocking — the caller skips the whole file on these
  notes: string[]; // informational — a fuzzy guess that succeeded, not an error
} {
  const map: Record<string, number> = {};
  headerRow.forEach((cell, idx) => {
    const key = COLUMN_ALIASES[normHeader(cell)];
    if (key) map[key] = idx;
  });

  // Fuzzy fallback for any field the exact pass above didn't find.
  const notes: string[] = [];
  const claimed = new Set(Object.values(map));
  for (const key of Object.keys(FUZZY_KEYWORDS)) {
    if (key in map) continue;
    const idx = fuzzyFindColumn(headerRow, claimed, key);
    if (idx !== null) {
      map[key] = idx;
      claimed.add(idx);
      notes.push(`Guessed column "${String(headerRow[idx])}" for "${key}" (no exact header match).`);
    }
  }

  const required = ["first", "last", "grade", "date"];
  const warnings = required
    .filter((k) => !(k in map))
    .map((k) => `Missing expected column for "${k}".`);
  return { map, warnings, notes };
}

export function parseProspectiveReportRows(
  rows: Cell[][],
): ParsedProspectiveReport {
  if (rows.length === 0) {
    return { rows: [], warnings: ["Sheet is empty."], notes: [] };
  }
  const { map, warnings: headerWarnings, notes: headerNotes } = buildColumnMap(rows[0]);
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

  return { rows: parsed, warnings: headerWarnings, notes: headerNotes };
}
