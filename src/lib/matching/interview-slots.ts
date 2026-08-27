import { db } from "@/lib/db";
import { interviewerAvailability, staff, matches, matchMeetings } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";

export type OpenInterviewSlot = {
  staffId: string;
  staffName: string;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
};

// ISO weekday (1=Mon..7=Sun) for a "YYYY-MM-DD" string, parsed as UTC so the
// server's local timezone can't shift the date across midnight.
function isoWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  return day === 0 ? 7 : day;
}

function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${Math.floor(total / 60)
    .toString()
    .padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`;
}

// Fixed interview slots open on a given shadow date, built from each
// interviewer's availability templates minus what's already booked that day.
// Excludes a prospective's own existing booking so re-confirming their match
// doesn't lock them out of the slot they already hold.
export async function getOpenInterviewSlots(
  date: string,
  excludeProspectiveId?: string,
): Promise<OpenInterviewSlot[]> {
  const weekday = isoWeekday(date);

  const [templates, admissionsStaff] = await Promise.all([
    db.select().from(interviewerAvailability),
    db.select().from(staff).where(eq(staff.kind, "admissions")),
  ]);
  const staffName = new Map(admissionsStaff.map((s) => [s.id, s.fullName]));

  const dateMatches = await db
    .select({ id: matches.id, prospectiveId: matches.prospectiveId })
    .from(matches)
    .where(eq(matches.shadowDate, date));
  const matchIds = dateMatches
    .filter((m) => m.prospectiveId !== excludeProspectiveId)
    .map((m) => m.id);
  const booked = matchIds.length
    ? await db
        .select()
        .from(matchMeetings)
        .where(
          and(
            inArray(matchMeetings.matchId, matchIds),
            eq(matchMeetings.kind, "admissions_interview"),
          ),
        )
    : [];
  const bookedKeys = new Set(
    booked
      .filter((b) => b.staffId && b.startTime)
      .map((b) => `${b.staffId}|${b.startTime!.slice(0, 5)}`),
  );

  const open: OpenInterviewSlot[] = [];
  for (const t of templates) {
    if (date < t.startDate || date > t.endDate) continue;
    if (!t.weekdays.includes(weekday)) continue;
    const name = staffName.get(t.staffId);
    if (!name) continue;
    for (const start of t.timeBlocks) {
      if (bookedKeys.has(`${t.staffId}|${start}`)) continue;
      open.push({ staffId: t.staffId, staffName: name, start, end: addMinutes(start, 30) });
    }
  }
  open.sort((a, b) => a.staffName.localeCompare(b.staffName) || a.start.localeCompare(b.start));
  return open;
}
