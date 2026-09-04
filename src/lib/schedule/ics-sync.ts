// Syncs host students' Outlook ICS feeds into host_schedule_days /
// host_schedule_blocks across the whole shadow-visit season in one pass.
// This is the ONLY place that fetches a host's calendar over the network —
// everything else (schedule comparison, the per-match printable timeline,
// deriveHostDay in admin/match/actions.ts, the matching engine itself) reads
// those tables directly, so those views stay fast and don't depend on
// Outlook being reachable at view time.
//
// Triggered only from the explicit "Refresh schedules" button on the
// host-schedule comparison tab (src/app/admin/hosts/schedules) — NOT on
// every /admin/match page load (see loader.ts's own history for why that
// used to be a serious performance problem).
//
// A host's whole ICS feed is one HTTP request regardless of how far out it
// covers — parseHostIcsFeed already parses every date it finds into a map,
// so syncing a multi-month season costs the same one fetch per host as
// syncing a single day used to. What used to loop one date at a time here
// now fetches once and writes every date in the season range in ~3 queries
// per host (a ranged delete, then one bulk insert for days, one for blocks)
// instead of looping per-day inserts.
import { db } from "@/lib/db";
import { hostStudents, hostScheduleDays, hostScheduleBlocks } from "@/lib/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { parseHostIcsFeed, type ParsedIcsDay } from "./parse-host-ics";
import { getShadowSeason, type ShadowSeason } from "./season";

export type SyncResult = {
  hostId: string;
  hostName: string;
  status: "synced" | "no-data" | "error";
  daysSynced?: number;
  message?: string;
};

async function fetchIcsFeedText(icsUrl: string): Promise<string> {
  // Plain fetch() has no default timeout. One slow or unreachable calendar
  // feed used to hang the entire match page indefinitely when this ran
  // inline on every match load — no longer does, but still worth bounding
  // since a stuck feed shouldn't be able to hang a manual refresh either.
  const res = await fetch(icsUrl, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Calendar feed responded ${res.status}`);
  const text = await res.text();
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("Not an iCalendar feed");
  return text;
}

async function writeSeason(
  hostId: string,
  season: ShadowSeason,
  dayMap: Map<string, ParsedIcsDay>,
): Promise<number> {
  // Replace whatever's on file for this host within the season window —
  // cascades to host_schedule_blocks via the FK.
  await db
    .delete(hostScheduleDays)
    .where(
      and(
        eq(hostScheduleDays.hostStudentId, hostId),
        gte(hostScheduleDays.date, season.start),
        lte(hostScheduleDays.date, season.end),
      ),
    );

  const datesInRange = [...dayMap.keys()].filter((d) => d >= season.start && d <= season.end).sort();
  if (!datesInRange.length) return 0;

  const insertedDays = await db
    .insert(hostScheduleDays)
    .values(
      datesInRange.map((date) => ({
        hostStudentId: hostId,
        date,
        dayType: dayMap.get(date)!.dayType ?? undefined,
      })),
    )
    .returning({ id: hostScheduleDays.id, date: hostScheduleDays.date });

  const blockRows = insertedDays.flatMap((day) =>
    (dayMap.get(day.date)?.blocks ?? []).map((b) => ({
      scheduleDayId: day.id,
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
  if (blockRows.length) await db.insert(hostScheduleBlocks).values(blockRows);

  return insertedDays.length;
}

export async function syncHostSeasonSchedule(
  host: { id: string; fullName: string; icsUrl: string | null },
  season: ShadowSeason,
): Promise<SyncResult> {
  if (!host.icsUrl) return { hostId: host.id, hostName: host.fullName, status: "no-data" };
  try {
    const text = await fetchIcsFeedText(host.icsUrl);
    const dayMap = parseHostIcsFeed(text);
    const daysSynced = await writeSeason(host.id, season, dayMap);
    return {
      hostId: host.id,
      hostName: host.fullName,
      status: daysSynced ? "synced" : "no-data",
      daysSynced,
    };
  } catch (e) {
    return {
      hostId: host.id,
      hostName: host.fullName,
      status: "error",
      message: e instanceof Error ? e.message : "Couldn't read calendar feed.",
    };
  }
}

export type SyncAllOutcome =
  | { ok: true; season: ShadowSeason; results: SyncResult[] }
  | { ok: false; message: string };

// Syncs every active, calendar-linked host across the whole configured
// season. Hosts without a saved link are skipped — their (if any) legacy
// CSV-imported rows are left untouched.
export async function syncAllHostSchedules(): Promise<SyncAllOutcome> {
  const season = await getShadowSeason();
  if (!season) {
    return {
      ok: false,
      message: "Set a shadow visit season first (Settings → Season), then refresh schedules.",
    };
  }

  const hosts = await db
    .select({ id: hostStudents.id, fullName: hostStudents.fullName, icsUrl: hostStudents.icsUrl })
    .from(hostStudents)
    .where(eq(hostStudents.active, true));
  const linked = hosts.filter((h) => h.icsUrl);
  const results = await Promise.all(linked.map((h) => syncHostSeasonSchedule(h, season)));
  return { ok: true, season, results };
}
