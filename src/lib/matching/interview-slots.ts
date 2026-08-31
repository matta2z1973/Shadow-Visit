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
// interviewer's availability templates minus what's already booked that day,
// for every prospective on that date at once.
//
// The templates/staff/bookings queries don't vary per prospective — only the
// "exclude my own existing booking so re-confirming doesn't lock me out of
// the slot I already hold" step does, and that's just a set-membership check
// once the bookings are loaded. This used to be a single-prospective function
// called once per prospective on /admin/match (getOpenInterviewSlots(date,
// id)), which re-ran the same 3 queries for every prospective on the date —
// with 8 prospectives that's ~24 near-identical round trips. Loading the
// shared data once and computing each prospective's list in memory cuts that
// to a fixed ~4 queries no matter how many prospectives there are.
export async function getOpenInterviewSlotsByProspective(
  date: string,
  prospectiveIds: string[],
): Promise<Map<string, OpenInterviewSlot[]>> {
  const weekday = isoWeekday(date);

  const [templates, admissionsStaff, dateMatches] = await Promise.all([
    db.select().from(interviewerAvailability),
    db.select().from(staff).where(eq(staff.kind, "admissions")),
    db
      .select({ id: matches.id, prospectiveId: matches.prospectiveId })
      .from(matches)
      .where(eq(matches.shadowDate, date)),
  ]);
  const staffName = new Map(admissionsStaff.map((s) => [s.id, s.fullName]));
  const prospectiveIdByMatchId = new Map(dateMatches.map((m) => [m.id, m.prospectiveId]));

  const matchIds = dateMatches.map((m) => m.id);
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

  // Every slot booked by anyone, plus which prospective (if any) holds each
  // one — so "booked by someone else" for prospective P is just "booked" set
  // minus P's own key.
  const bookedByKey = new Map<string, string | null>(); // key -> prospectiveId
  for (const b of booked) {
    if (!b.staffId || !b.startTime) continue;
    const key = `${b.staffId}|${b.startTime.slice(0, 5)}`;
    bookedByKey.set(key, prospectiveIdByMatchId.get(b.matchId) ?? null);
  }

  const slotDefs: (OpenInterviewSlot & { key: string })[] = [];
  for (const t of templates) {
    if (date < t.startDate || date > t.endDate) continue;
    if (!t.weekdays.includes(weekday)) continue;
    const name = staffName.get(t.staffId);
    if (!name) continue;
    for (const start of t.timeBlocks) {
      slotDefs.push({
        key: `${t.staffId}|${start}`,
        staffId: t.staffId,
        staffName: name,
        start,
        end: addMinutes(start, 30),
      });
    }
  }
  slotDefs.sort((a, b) => a.staffName.localeCompare(b.staffName) || a.start.localeCompare(b.start));

  const result = new Map<string, OpenInterviewSlot[]>();
  for (const prospectiveId of prospectiveIds) {
    const open = slotDefs
      .filter((s) => {
        const holder = bookedByKey.get(s.key);
        return holder === undefined || holder === prospectiveId;
      })
      .map(({ key: _key, ...slot }) => slot);
    result.set(prospectiveId, open);
  }
  return result;
}
