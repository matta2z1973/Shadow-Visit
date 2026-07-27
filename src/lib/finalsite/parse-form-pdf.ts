// Parses Greenhill's FinalSite "Interview and Visit Form" PDF (one applicant
// per PDF). The layout is a label→value grid: labels sit in the left/right
// margins, values in two columns (x≈184 left, x≈440 right), aligned by row (y).
//
// We match on label text, then read the value token(s) in the target column on
// the same row (with a small vertical span for wrapped values). This is far
// more robust to spacing changes than fixed coordinates.

import type { Token } from "@/lib/schedule/types";
import { splitSpaceName } from "../names";

export type ParsedInterest = {
  rank: number; // 1-4
  name: string | null; // e.g. "Debate/Speech"
  position: string | null; // Position/Instrument
  yearsInvolved: string | null;
  level: string | null; // Level of Involvement
};

export type ParsedVisitForm = {
  studentName: string | null;
  firstName: string | null;
  lastName: string | null;
  grade: number | null;
  gradeRaw: string | null; // "11th"
  gender: "M" | "F" | null;
  currentSchool: string | null;
  schoolStatus: string | null;
  interests: ParsedInterest[]; // ranked non-academic
  academicInterest: string | null; // e.g. "Chinese"
  scheduleChoice: string | null; // "Interview Only" | "Shadow Visit/Interview" ...
  wantsShadow: boolean;
  shadowDate: string | null; // YYYY-MM-DD, if a shadow day was chosen
  interviewDate: string | null; // YYYY-MM-DD
  interviewStart: string | null; // HH:MM:SS
  interviewEnd: string | null; // HH:MM:SS
  familyEmail: string | null; // from the signature line
  additionalInfo: string | null; // free-text response
  warnings: string[];
};

const Y_TOL = 2.6;

// Left value column ~184; right value column ~440.
const LEFT = { min: 178, max: 330 };
const RIGHT = { min: 418, max: 575 };

function findLabel(tokens: Token[], includes: string): Token | null {
  const needle = includes.toLowerCase();
  // Field labels are indented (x >= 60); section headers sit at x≈54 and share
  // the same text in places ("Academic Interest"), so exclude them. Ignore long
  // paragraph tokens too.
  const candidates = tokens
    .filter(
      (t) =>
        t.x >= 60 && t.str.toLowerCase().includes(needle) && t.str.length < 80,
    )
    .sort((a, b) => a.x - b.x);
  return candidates[0] ?? null;
}

function valueAt(
  tokens: Token[],
  anchorY: number,
  page: number,
  col: { min: number; max: number },
  span = Y_TOL,
): string | null {
  const items = tokens
    .filter(
      (t) =>
        t.page === page &&
        t.x >= col.min &&
        t.x <= col.max &&
        t.y <= anchorY + Y_TOL &&
        t.y >= anchorY - span,
    )
    .sort((a, b) => b.y - a.y || a.x - b.x);
  if (!items.length) return null;
  return items.map((t) => t.str).join(" ").replace(/\s+/g, " ").trim() || null;
}

function valueForLabel(
  tokens: Token[],
  label: string,
  col: { min: number; max: number },
  span = Y_TOL,
): string | null {
  const l = findLabel(tokens, label);
  if (!l) return null;
  return valueAt(tokens, l.y, l.page, col, span);
}

function parseGrade(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.match(/(\d{1,2})/);
  return m ? parseInt(m[1], 10) : null;
}

function parseGender(raw: string | null): "M" | "F" | null {
  if (!raw) return null;
  if (/female/i.test(raw)) return "F";
  if (/male/i.test(raw)) return "M";
  return null;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function to24h(t: string): string | null {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const mer = m[3].toUpperCase();
  if (mer === "PM" && h !== 12) h += 12;
  if (mer === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${min}:00`;
}

// "Tue, Jul 28th, 2026 1:00PM - 1:30PM" -> { date, start, end }
// Also handles a bare "Wed, Aug 20th, 2026" (all-day shadow date).
export function parseHumanDate(raw: string | null): {
  date: string | null;
  start: string | null;
  end: string | null;
} {
  if (!raw) return { date: null, start: null, end: null };
  const dm = raw.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
  let date: string | null = null;
  if (dm) {
    const mon = MONTHS[dm[1].slice(0, 3).toLowerCase()];
    if (mon) date = `${dm[3]}-${mon}-${dm[2].padStart(2, "0")}`;
  }
  const times = raw.match(/(\d{1,2}:\d{2}\s*[AP]M)/gi) ?? [];
  const start = times[0] ? to24h(times[0]) : null;
  const end = times[1] ? to24h(times[1]) : null;
  return { date, start, end };
}

export function parseInterviewVisitForm(tokens: Token[]): ParsedVisitForm {
  const warnings: string[] = [];

  const studentName = valueForLabel(tokens, "Student Name", LEFT);
  const gradeRaw = valueForLabel(tokens, "Applying for Grade", LEFT);
  const gender = parseGender(valueForLabel(tokens, "Gender", LEFT));
  const currentSchool = valueForLabel(tokens, "Current School", RIGHT);
  const schoolStatus = valueForLabel(tokens, "School Status", RIGHT, 14);
  const academicInterest = valueForLabel(tokens, "Academic Interest", LEFT);

  // Ranked interests: anchor each on its "Sport/Fine Art/Club Interest N" label.
  const interests: ParsedInterest[] = [];
  for (let rank = 1; rank <= 4; rank++) {
    const label = findLabel(tokens, `Sport/Fine Art/Club Interest ${rank}`);
    if (!label) continue;
    const name = valueAt(tokens, label.y, label.page, LEFT);
    const years = valueAt(tokens, label.y, label.page, RIGHT);
    // Position/Instrument + Level of Involvement sit one row below (~14px).
    const position = valueAt(tokens, label.y - 14, label.page, LEFT);
    const level = valueAt(tokens, label.y - 14, label.page, RIGHT);
    interests.push({
      rank,
      name: name || null,
      position: position || null,
      yearsInvolved: years || null,
      level: level || null,
    });
  }

  // Schedule choice (Shadow Visit/Interview vs Interview only).
  const scheduleChoice = valueForLabel(tokens, "Please choose to schedule", LEFT);
  const wantsShadow = !!scheduleChoice && /shadow/i.test(scheduleChoice);

  // Interview day/time.
  const interviewRaw = valueForLabel(tokens, "select an Interview Day", LEFT, 14);
  const interview = parseHumanDate(interviewRaw);

  // Shadow day — label wording unconfirmed (no sample yet); match a short label
  // token containing both "Shadow" and "Day".
  const shadowLabel = tokens
    .filter(
      (t) =>
        t.str.length < 60 &&
        /shadow/i.test(t.str) &&
        /day/i.test(t.str) &&
        /select/i.test(t.str),
    )
    .sort((a, b) => a.x - b.x)[0];
  let shadowDate: string | null = null;
  if (shadowLabel) {
    const raw = valueAt(tokens, shadowLabel.y, shadowLabel.page, LEFT, 14);
    shadowDate = parseHumanDate(raw).date;
  } else if (wantsShadow) {
    warnings.push(
      "Applicant chose a shadow visit but no shadow-date field was found — confirm the label.",
    );
  }

  // Family email from the signature line ("Signed by <email> on ...").
  let familyEmail: string | null = null;
  const signed = tokens.find((t) => /Signed by\s+\S+@\S+/i.test(t.str));
  if (signed) {
    const em = signed.str.match(/Signed by\s+(\S+@\S+?)\s+on/i);
    familyEmail = em ? em[1] : null;
  }

  // Free-text response (best effort): value-column tokens under "Response:".
  const respLabel = findLabel(tokens, "Response:");
  let additionalInfo: string | null = null;
  if (respLabel) {
    const lines = tokens
      .filter(
        (t) => t.page === respLabel.page && t.x >= 180 && t.y <= respLabel.y + 2,
      )
      .sort((a, b) => b.y - a.y)
      .map((t) => t.str);
    additionalInfo = lines.join(" ").replace(/\s+/g, " ").trim() || null;
  }

  if (!studentName) warnings.push("Could not read student name.");
  if (!gradeRaw) warnings.push("Could not read applying grade.");

  const nameSplit = studentName ? splitSpaceName(studentName) : { first: "", last: "" };

  return {
    studentName,
    firstName: studentName ? nameSplit.first || null : null,
    lastName: studentName ? nameSplit.last || null : null,
    grade: parseGrade(gradeRaw),
    gradeRaw,
    gender,
    currentSchool,
    schoolStatus,
    interests,
    academicInterest,
    scheduleChoice,
    wantsShadow,
    shadowDate,
    interviewDate: interview.date,
    interviewStart: interview.start,
    interviewEnd: interview.end,
    familyEmail,
    additionalInfo,
    warnings,
  };
}
