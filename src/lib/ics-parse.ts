// Parses a published Outlook/Google free/busy .ics feed into busy intervals,
// and computes whether a staff member is free during the school day's blocks.
//
// Times are normalized to a UTC millisecond instant. Floating and
// America/Chicago-local times are interpreted as Central; UTC ("Z") times are
// used directly. This is a pragmatic Central-time model (handles US DST) — good
// for scheduling against the Greenhill day without pulling a tz library.

export type BusyInterval = {
  startMs: number;
  endMs: number;
  summary: string;
  allDay: boolean;
};

// Unfold RFC-5545 continuation lines (a line starting with space/tab continues
// the previous one).
export function unfold(text: string): string[] {
  const raw = text.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

// 2nd Sunday of March → 1st Sunday of November (America/Chicago DST window).
function nthSunday(year: number, month0: number, n: number): number {
  const first = new Date(Date.UTC(year, month0, 1)).getUTCDay();
  const firstSunday = ((7 - first) % 7) + 1;
  return firstSunday + (n - 1) * 7;
}
function isCentralDST(y: number, mo1: number, d: number): boolean {
  if (mo1 < 3 || mo1 > 11) return false;
  if (mo1 > 3 && mo1 < 11) return true;
  if (mo1 === 3) return d >= nthSunday(y, 2, 2);
  return d < nthSunday(y, 10, 1); // November
}
function centralOffsetHours(y: number, mo1: number, d: number): number {
  return isCentralDST(y, mo1, d) ? -5 : -6; // CDT / CST
}

// Convert local Central components to a UTC millisecond instant.
export function centralToUtcMs(
  y: number,
  mo1: number,
  d: number,
  h: number,
  mi: number,
  s = 0,
): number {
  const offset = centralOffsetHours(y, mo1, d);
  return Date.UTC(y, mo1 - 1, d, h, mi, s) - offset * 3600_000;
}

// Parse an ICS DTSTART/DTEND value (with optional params) → UTC ms.
function parseDt(value: string, isUtc: boolean): { ms: number; allDay: boolean } {
  const dateOnly = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly.map(Number) as unknown as number[];
    return { ms: centralToUtcMs(y, mo, d, 0, 0), allDay: true };
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (!m) return { ms: NaN, allDay: false };
  const [, y, mo, d, h, mi, s] = m.map(Number) as unknown as number[];
  if (isUtc) return { ms: Date.UTC(y, mo - 1, d, h, mi, s), allDay: false };
  return { ms: centralToUtcMs(y, mo, d, h, mi, s), allDay: false };
}

export function parseIcsFeed(text: string): BusyInterval[] {
  const lines = unfold(text);
  const events: BusyInterval[] = [];
  let cur: Partial<BusyInterval> | null = null;

  for (const line of lines) {
    if (line.startsWith("BEGIN:VEVENT")) {
      cur = { summary: "Busy", allDay: false };
      continue;
    }
    if (line.startsWith("END:VEVENT")) {
      if (cur && cur.startMs != null && cur.endMs != null && !Number.isNaN(cur.startMs)) {
        events.push(cur as BusyInterval);
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon);
    const value = line.slice(colon + 1).trim();
    const name = key.split(";")[0].toUpperCase();
    const isUtc = value.endsWith("Z");

    if (name === "DTSTART") {
      const p = parseDt(value.replace(/Z$/, ""), isUtc);
      cur.startMs = p.ms;
      cur.allDay = p.allDay;
    } else if (name === "DTEND") {
      cur.endMs = parseDt(value.replace(/Z$/, ""), isUtc).ms;
    } else if (name === "SUMMARY") {
      cur.summary = value || "Busy";
    }
  }
  return events;
}

export type BlockFreeBusy = {
  label: string;
  startTime: string; // HH:MM:SS local
  endTime: string;
  free: boolean;
  conflict: string | null; // summary of the overlapping busy event, if any
};

// For each candidate block on `date`, decide free/busy against the feed.
export function blocksFreeBusy(
  busy: BusyInterval[],
  date: string, // YYYY-MM-DD (Central)
  blocks: { label: string; startTime: string; endTime: string }[],
): BlockFreeBusy[] {
  const [y, mo, d] = date.split("-").map(Number);
  return blocks.map((b) => {
    const [sh, sm] = b.startTime.split(":").map(Number);
    const [eh, em] = b.endTime.split(":").map(Number);
    const startMs = centralToUtcMs(y, mo, d, sh, sm);
    const endMs = centralToUtcMs(y, mo, d, eh, em);
    let conflict: string | null = null;
    for (const ev of busy) {
      const overlaps = ev.startMs < endMs && ev.endMs > startMs;
      if (overlaps) {
        conflict = ev.summary;
        break;
      }
    }
    return { ...b, free: !conflict, conflict };
  });
}

// Fetch a feed URL (server-side). Returns parsed busy intervals or throws.
export async function fetchBusyIntervals(url: string): Promise<BusyInterval[]> {
  // See src/lib/schedule/ics-sync.ts for why this needs an explicit timeout
  // — plain fetch() has none, and a stuck feed used to hang the whole page.
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Feed responded ${res.status}`);
  const text = await res.text();
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("Not an iCalendar feed");
  return parseIcsFeed(text);
}
