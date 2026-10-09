// Shared, pure types + diff logic for the two-step FinalSite import (preview →
// review/edit → apply). No DB or server imports: the preview table runs this
// in the browser to re-derive each row's status as the admin edits it, and the
// apply action runs the same code server-side so both agree on what changed.

export type ImportGender = "M" | "F" | null;

// The editable fields of one prospective, exactly as they'll be written.
export type ImportValues = {
  firstName: string;
  lastName: string;
  preferredName: string; // display-only: fullName = (preferred || first) + last
  gender: ImportGender;
  grade: number | null;
  currentSchool: string;
  shadowDate: string; // YYYY-MM-DD or ""
  shadowStart: string; // HH:MM or ""
  shadowEnd: string; // HH:MM or ""
  interestIds: (string | null)[]; // index 0 = priority 1; always length 4
};

export type ExistingCandidate = {
  id: string;
  label: string; // "Jane Doe · grade 9 · Oct 14" — for the match-to picker
  values: ImportValues;
  hasMatches: boolean; // a match row exists for this prospective already
};

export type PreviewRow = {
  key: string; // stable client key
  fileName: string;
  rowNumber: number; // spreadsheet row, 1-based incl. header — for "row 7 of file"
  parsed: ImportValues; // what the file said, after interest-name lookup
  unmappedInterests: string[]; // names in the file that matched no interest
  parseWarnings: string[];
  candidates: ExistingCandidate[]; // existing records with the same name
  defaultTargetId: string | null; // null = add as new
  duplicateInFile: boolean; // same name appeared earlier in the upload
};

export type InterestOption = { id: string; name: string; category: string; active: boolean };

export const INTEREST_SLOTS = 4;

// Column-mapping select value meaning "this file has no column for the field".
export const NOT_IN_FILE = "__none__";

export const FIELD_LABELS: Record<Exclude<keyof ImportValues, "interestIds">, string> = {
  firstName: "First name",
  lastName: "Last name",
  preferredName: "Preferred name",
  gender: "Gender",
  grade: "Grade",
  currentSchool: "Current school",
  shadowDate: "Visit date",
  shadowStart: "Start",
  shadowEnd: "End",
};

export function normName(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function nameKey(first: string | null | undefined, last: string | null | undefined): string {
  return `${normName(first)}|${normName(last)}`;
}

export function composeFullName(v: Pick<ImportValues, "firstName" | "lastName" | "preferredName">): string {
  return [v.preferredName.trim() || v.firstName.trim(), v.lastName.trim()].filter(Boolean).join(" ");
}

// Field-by-field comparison. preferredName isn't stored on its own — it only
// shapes fullName — so it's compared via the composed display name instead.
export function changedFields(before: ImportValues, after: ImportValues): string[] {
  const out: string[] = [];
  if (before.firstName.trim() !== after.firstName.trim()) out.push("firstName");
  if (before.lastName.trim() !== after.lastName.trim()) out.push("lastName");
  if (composeFullName(before) !== composeFullName(after)) out.push("preferredName");
  if (before.gender !== after.gender) out.push("gender");
  if (before.grade !== after.grade) out.push("grade");
  if (before.currentSchool.trim() !== after.currentSchool.trim()) out.push("currentSchool");
  if (before.shadowDate !== after.shadowDate) out.push("shadowDate");
  if (before.shadowStart !== after.shadowStart) out.push("shadowStart");
  if (before.shadowEnd !== after.shadowEnd) out.push("shadowEnd");
  const ib = before.interestIds.map((x) => x ?? "").join(",");
  const ia = after.interestIds.map((x) => x ?? "").join(",");
  if (ib !== ia) out.push("interestIds");
  return out;
}

export type RowStatus = "new" | "update" | "unchanged" | "invalid";

export function rowStatus(
  values: ImportValues,
  target: ExistingCandidate | null,
): { status: RowStatus; changed: string[] } {
  if (!values.firstName.trim() && !values.lastName.trim()) return { status: "invalid", changed: [] };
  if (!target) return { status: "new", changed: [] };
  const changed = changedFields(target.values, values);
  return { status: changed.length ? "update" : "unchanged", changed };
}

// Things an admin should look at before applying, independent of whether the
// row is new or an update.
export function rowAttention(
  values: ImportValues,
  row: Pick<PreviewRow, "unmappedInterests" | "candidates" | "duplicateInFile">,
  target: ExistingCandidate | null,
  changed: string[],
): string[] {
  const out: string[] = [];
  if (!values.gender) out.push("No gender — required for matching.");
  if (!values.grade) out.push("No grade.");
  if (!values.shadowDate) out.push("No visit date.");
  if (row.unmappedInterests.length)
    out.push(`Unrecognized interest(s) in file: ${row.unmappedInterests.join(", ")}`);
  if (row.candidates.length > 1) out.push(`${row.candidates.length} existing records share this name — check "Match to".`);
  if (row.duplicateInFile) out.push("This name appears more than once in the upload.");
  if (target?.hasMatches && (changed.includes("shadowDate") || changed.includes("grade") || changed.includes("gender")))
    out.push("Already has a match — changing date/grade/gender won't move or remove it; re-run matching.");
  return out;
}

// Picks the default existing record for a parsed row: one same-name record →
// that one (even if the grade changed — that's the duplicate-on-correction
// case this whole flow exists to stop). Several → prefer the one whose grade
// matches; still ambiguous → the first, flagged for the admin to confirm.
export function pickDefaultTarget(
  parsed: ImportValues,
  candidates: ExistingCandidate[],
): string | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].id;
  const sameGrade = candidates.filter((c) => c.values.grade === parsed.grade);
  return (sameGrade[0] ?? candidates[0]).id;
}
