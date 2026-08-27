import { db } from "@/lib/db";
import {
  matches,
  prospectiveStudents,
  hostStudents,
  hostScheduleDays,
  hostScheduleBlocks,
  matchMeetings,
  staff,
  profiles,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  buildTimeline,
  type HostBlockInput,
  type MeetingInput,
  type TimelineRow,
} from "@/lib/schedule/day-timeline";

export type MatchDetail = {
  match: typeof matches.$inferSelect;
  prospective: typeof prospectiveStudents.$inferSelect;
  host: typeof hostStudents.$inferSelect | null;
  // Only set if the host has ever logged in (host_students.profile_id) —
  // hosts imported without ever visiting /me have no email on file.
  hostEmail: string | null;
  interviewerName: string | null;
  timeline: TimelineRow[];
};

export async function getMatchDetail(matchId: string): Promise<MatchDetail | null> {
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match) return null;

  const [prospective] = await db
    .select()
    .from(prospectiveStudents)
    .where(eq(prospectiveStudents.id, match.prospectiveId))
    .limit(1);
  if (!prospective) return null;

  const host = match.hostStudentId
    ? (await db
        .select()
        .from(hostStudents)
        .where(eq(hostStudents.id, match.hostStudentId))
        .limit(1))[0] ?? null
    : null;

  const hostEmail = host?.profileId
    ? (
        await db
          .select({ email: profiles.email })
          .from(profiles)
          .where(eq(profiles.id, host.profileId))
          .limit(1)
      )[0]?.email ?? null
    : null;

  // Host's blocks for the shadow date — a plain DB read. This reflects
  // whatever was last synced from the host's calendar (during a matching
  // run, or an explicit refresh on the schedule comparison tab), not a live
  // fetch on every view.
  let hostBlocks: HostBlockInput[] = [];
  if (host) {
    const [day] = await db
      .select()
      .from(hostScheduleDays)
      .where(
        and(
          eq(hostScheduleDays.hostStudentId, host.id),
          eq(hostScheduleDays.date, match.shadowDate),
        ),
      )
      .limit(1);
    if (day) {
      const blocks = await db
        .select()
        .from(hostScheduleBlocks)
        .where(eq(hostScheduleBlocks.scheduleDayId, day.id));
      hostBlocks = blocks.map((b) => ({
        blockLabel: b.blockLabel,
        courseTitle: b.courseTitle,
        room: b.room,
        teacher: b.teacher,
        isAcademic: b.isAcademic,
        startTime: b.startTime,
        endTime: b.endTime,
      }));
    }
  }

  // Meetings + staff names.
  const mtgs = await db
    .select()
    .from(matchMeetings)
    .where(eq(matchMeetings.matchId, match.id));
  const staffIds = [
    ...new Set(mtgs.map((m) => m.staffId).filter((s): s is string => !!s)),
  ];
  const staffRows = staffIds.length
    ? await db.select().from(staff)
    : [];
  const staffName = new Map(staffRows.map((s) => [s.id, s.fullName]));

  const meetings: MeetingInput[] = mtgs.map((m) => ({
    kind: m.kind,
    title:
      m.kind === "admissions_interview"
        ? "Admissions Interview"
        : "Faculty Meeting",
    detail: m.staffId ? (staffName.get(m.staffId) ?? null) : m.notes ?? null,
    startTime: m.startTime,
    endTime: m.endTime,
  }));

  const interviewerName = prospective.interviewerStaffId
    ? staffName.get(prospective.interviewerStaffId) ?? null
    : null;

  const timeline = buildTimeline(hostBlocks, meetings);
  return { match, prospective, host, hostEmail, interviewerName, timeline };
}
