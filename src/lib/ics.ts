// Minimal RFC-5545 .ics builder for calendar invites (faculty meetings,
// admissions interviews, and the full shadow-day event). No external deps.
//
// Recipients open the .ics (emailed via Resend) and it adds to Outlook/Google.
// This is the one-way "write" path that needs no MS Graph / IT approval.

export type IcsEvent = {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM:SS (local, America/Chicago)
  endTime: string; // HH:MM:SS
  organizerEmail?: string;
  attendeeEmails?: string[];
};

function fold(line: string): string {
  // RFC 5545: lines SHOULD be <= 75 octets; continuation lines start with a space.
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let s = line;
  parts.push(s.slice(0, 75));
  s = s.slice(75);
  while (s.length > 74) {
    parts.push(" " + s.slice(0, 74));
    s = s.slice(74);
  }
  if (s.length) parts.push(" " + s);
  return parts.join("\r\n");
}

function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// "2026-02-18" + "08:30:00" -> "20260218T083000"
function toLocalStamp(date: string, time: string): string {
  return `${date.replace(/-/g, "")}T${time.replace(/:/g, "")}`;
}

// A fixed DTSTAMP is required; callers pass one so the output stays deterministic.
export function buildIcs(events: IcsEvent[], dtstamp: string): string {
  const tzid = "America/Chicago";
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Greenhill//Shadow Visit//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
  ];

  for (const e of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.uid}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;TZID=${tzid}:${toLocalStamp(e.date, e.startTime)}`);
    lines.push(`DTEND;TZID=${tzid}:${toLocalStamp(e.date, e.endTime)}`);
    lines.push(`SUMMARY:${esc(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.organizerEmail) lines.push(`ORGANIZER:mailto:${e.organizerEmail}`);
    for (const a of e.attendeeEmails ?? []) {
      lines.push(`ATTENDEE;RSVP=TRUE:mailto:${a}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n");
}
