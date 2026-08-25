// Parses a host student's personal Outlook/Exchange "Publish a calendar" ICS
// feed into a per-date schedule lookup.
//
// This is richer than the Blackbaud CSV export it replaces: each class block
// is a timed VEVENT whose SUMMARY carries the block letter AND the teacher's
// last name as two trailing parentheticals — confirmed against a real feed:
// "English 10 - U1020-6  (E Block) (Cantu)". LOCATION carries the room, and
// — critically — each school day also has an all-day marker event naming the
// exact 7-day rotation slot ("Green 1", "Gold 2", ... "Gold X"), which is a
// more precise signal than guessing green/gold from which block letters
// happen to appear that day.
//
// Times are read as literal local wall-clock straight off DTSTART/DTEND (both
// real feeds seen use TZID-qualified values, which per RFC 5545 already are
// local time — no conversion needed). A bare UTC "Z" timestamp would be off
// by the Central offset; not observed in practice, so not handled specially.

import { unfold } from "@/lib/ics-parse";
import { ACADEMIC_BLOCK } from "./parse-host-csv";

export type ParsedIcsBlock = {
  blockLabel: string;
  courseTitle: string | null;
  courseCode: string | null;
  room: string | null;
  teacher: string | null;
  isAcademic: boolean;
  startTime: string; // HH:MM:SS
  endTime: string;
};

export type ParsedIcsDay = {
  dayType: "green" | "gold" | null;
  blocks: ParsedIcsBlock[];
};

type RawEvent = {
  summary: string | null;
  location: string | null;
  dtstartRaw: string | null;
  dtendRaw: string | null;
  allDay: boolean;
};

function extractDateTime(raw: string): { date: string; time: string } | null {
  const m = raw.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}:${s}` };
}

// RFC 5545 §3.3.11 TEXT escaping: \, \; \\ and \n/\N for a literal newline.
function unescapeIcsText(raw: string): string {
  return raw.replace(/\\([,;\\nN])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));
}

function extractDate(raw: string): string | null {
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo}-${d}`;
}

// "English 10 - U1020-6" -> title "English 10", code "U1020-6"
// "Lunch - US" -> title "Lunch - US", code null (doesn't look like a course code)
const CODE_SUFFIX = /^(.*?)\s*-\s*([A-Za-z]?\d{3,4}[A-Za-z]?-\d+)\s*$/;

function splitTitleCode(pre: string): { title: string | null; code: string | null } {
  const trimmed = pre.trim();
  if (!trimmed) return { title: null, code: null };
  const m = trimmed.match(CODE_SUFFIX);
  if (m) return { title: m[1].trim() || null, code: m[2].trim() };
  return { title: trimmed, code: null };
}

// "English 10 - U1020-6  (E Block) (Cantu)" -> title/code from the pre-paren
//   text, blockLabel "E Block", teacher "Cantu" (the common case — most
//   class blocks carry a trailing teacher-last-name parenthetical too).
// "Lunch - US  (Lunch)" -> blockLabel "Lunch", no teacher paren present.
// "Hornet Study Session" (no trailing paren at all) -> whole string is the
//   blockLabel.
const TWO_PAREN = /^(.*?)\s*\(([^)]+)\)\s*\(([^)]+)\)\s*$/;
const ONE_PAREN = /^(.*?)\s*\(([^)]+)\)\s*$/;

function splitSummary(summary: string): {
  title: string | null;
  code: string | null;
  blockLabel: string;
  teacher: string | null;
} {
  const two = summary.match(TWO_PAREN);
  if (two) {
    const { title, code } = splitTitleCode(two[1]);
    return { title, code, blockLabel: two[2].trim(), teacher: two[3].trim() || null };
  }
  const one = summary.match(ONE_PAREN);
  if (one) {
    const { title, code } = splitTitleCode(one[1]);
    return { title, code, blockLabel: one[2].trim(), teacher: null };
  }
  const label = summary.trim();
  return { title: label || null, code: null, blockLabel: label, teacher: null };
}

export function parseHostIcsFeed(text: string): Map<string, ParsedIcsDay> {
  const lines = unfold(text);
  const events: RawEvent[] = [];
  let cur: RawEvent | null = null;

  for (const line of lines) {
    if (line.startsWith("BEGIN:VEVENT")) {
      cur = { summary: null, location: null, dtstartRaw: null, dtendRaw: null, allDay: false };
      continue;
    }
    if (line.startsWith("END:VEVENT")) {
      if (cur) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;

    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon);
    const value = line.slice(colon + 1).trim();
    const name = key.split(";")[0].toUpperCase();

    if (name === "SUMMARY") cur.summary = unescapeIcsText(value);
    else if (name === "LOCATION") cur.location = unescapeIcsText(value) || null;
    else if (name === "DTSTART") {
      cur.dtstartRaw = value;
      cur.allDay = key.includes("VALUE=DATE");
    } else if (name === "DTEND") {
      cur.dtendRaw = value;
    }
  }

  const dayTypeByDate = new Map<string, "green" | "gold" | null>();
  const blocksByDate = new Map<string, ParsedIcsBlock[]>();

  for (const e of events) {
    if (!e.dtstartRaw || !e.summary) continue;

    if (e.allDay) {
      const date = extractDate(e.dtstartRaw);
      if (!date) continue;
      const label = e.summary.trim();
      const dayType = /^green\b/i.test(label) ? "green" : /^gold\b/i.test(label) ? "gold" : null;
      dayTypeByDate.set(date, dayType);
      continue;
    }

    const start = extractDateTime(e.dtstartRaw);
    const end = e.dtendRaw ? extractDateTime(e.dtendRaw) : null;
    if (!start || !end) continue;

    const { title, code, blockLabel, teacher } = splitSummary(e.summary);
    const list = blocksByDate.get(start.date) ?? [];
    list.push({
      blockLabel,
      courseTitle: title,
      courseCode: code,
      room: e.location,
      teacher,
      isAcademic: ACADEMIC_BLOCK.test(blockLabel),
      startTime: start.time,
      endTime: end.time,
    });
    blocksByDate.set(start.date, list);
  }

  const result = new Map<string, ParsedIcsDay>();
  const allDates = new Set([...dayTypeByDate.keys(), ...blocksByDate.keys()]);
  for (const date of allDates) {
    result.set(date, {
      dayType: dayTypeByDate.get(date) ?? null,
      blocks: (blocksByDate.get(date) ?? []).sort((a, b) =>
        a.startTime.localeCompare(b.startTime),
      ),
    });
  }
  return result;
}
