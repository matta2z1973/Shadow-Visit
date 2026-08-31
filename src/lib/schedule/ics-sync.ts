// Syncs host students' Outlook ICS feeds into host_schedule_days /
// host_schedule_blocks for one date. This is the ONLY place that fetches a
// host's calendar over the network — everything else (schedule comparison,
// the per-match printable timeline, deriveHostDay in admin/match/actions.ts)
// reads those tables directly, so those views stay fast and don't depend on
// Outlook being reachable at view time.
//
// Triggered from two places: automatically whenever matching runs for a date
// (src/lib/matching/loader.ts), and from the explicit "Refresh schedules"
// button on the host-schedule comparison tab.
import { db } from "@/lib/db";
import { hostStudents, hostScheduleDays, hostScheduleBlocks } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { parseHostIcsFeed, type ParsedIcsDay } from "./parse-host-ics";

export type SyncResult = {
  hostId: string;
  hostName: string;
  status: "synced" | "no-data" | "error";
  message?: string;
};

async function fetchIcsDay(icsUrl: string, date: string): Promise<ParsedIcsDay | null> {
  // Plain fetch() has no default timeout. One slow or unreachable calendar
  // feed used to hang the entire match page indefinitely (all hosts sync in
  // parallel, so this was the single biggest source of full-page hangs on
  // /admin/match — nothing to do with the database). AbortSignal.timeout
  // turns a stuck feed into a normal caught error instead.
  const res = await fetch(icsUrl, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Calendar feed responded ${res.status}`);
  const text = await res.text();
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("Not an iCalendar feed");
  return parseHostIcsFeed(text).get(date) ?? null;
}

async function writeDay(hostId: string, date: string, day: ParsedIcsDay | null): Promise<void> {
  const existing = await db
    .select({ id: hostScheduleDays.id })
    .from(hostScheduleDays)
    .where(and(eq(hostScheduleDays.hostStudentId, hostId), eq(hostScheduleDays.date, date)));
  for (const d of existing) {
    await db.delete(hostScheduleDays).where(eq(hostScheduleDays.id, d.id));
  }
  if (!day) return; // weekend/holiday/out of the feed's range — leave no row

  const [inserted] = await db
    .insert(hostScheduleDays)
    .values({
      hostStudentId: hostId,
      date,
      dayType: day.dayType ?? undefined,
    })
    .returning({ id: hostScheduleDays.id });

  if (day.blocks.length) {
    await db.insert(hostScheduleBlocks).values(
      day.blocks.map((b) => ({
        scheduleDayId: inserted.id,
        blockLabel: b.blockLabel,
        courseTitle: b.courseTitle,
        courseCode: b.courseCode,
        room: b.room,
        teacher: b.teacher,
        isAcademic: b.isAcademic,
        startTime: b.startTime,
        endTime: b.endTime,
      })),
    );
  }
}

export async function syncHostScheduleDay(
  host: { id: string; fullName: string; icsUrl: string | null },
  date: string,
): Promise<SyncResult> {
  if (!host.icsUrl) return { hostId: host.id, hostName: host.fullName, status: "no-data" };
  try {
    const day = await fetchIcsDay(host.icsUrl, date);
    await writeDay(host.id, date, day);
    return { hostId: host.id, hostName: host.fullName, status: day ? "synced" : "no-data" };
  } catch (e) {
    return {
      hostId: host.id,
      hostName: host.fullName,
      status: "error",
      message: e instanceof Error ? e.message : "Couldn't read calendar feed.",
    };
  }
}

// Syncs every active, calendar-linked host for one date. Hosts without a
// saved link are skipped — their (if any) legacy CSV-imported rows are left
// untouched.
export async function syncSchedulesForDate(date: string): Promise<SyncResult[]> {
  const hosts = await db
    .select({ id: hostStudents.id, fullName: hostStudents.fullName, icsUrl: hostStudents.icsUrl })
    .from(hostStudents)
    .where(eq(hostStudents.active, true));
  const linked = hosts.filter((h) => h.icsUrl);
  return Promise.all(linked.map((h) => syncHostScheduleDay(h, date)));
}
