import { db } from "@/lib/db";
import {
  hostStudents,
  hostScheduleDays,
  hostScheduleBlocks,
  hostStudentInterests,
  prospectiveStudents,
  prospectiveInterests,
  interests,
  matches,
  appSettings,
} from "@/lib/db/schema";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  assignBulk,
  type HostForMatch,
  type ProspectiveForMatch,
  type RankedMatch,
} from "./engine";
import { courseCoveredInterestIds, type InterestRef } from "./course-map";

export async function getSoftCap(): Promise<number> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, "host_soft_cap"))
    .limit(1);
  const n = row ? parseInt(row.value, 10) : 5;
  return Number.isFinite(n) ? n : 5;
}

// Distinct shadow dates among prospectives who want a shadow visit.
export async function getShadowDates(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ date: prospectiveStudents.shadowDate })
    .from(prospectiveStudents)
    .where(
      and(
        eq(prospectiveStudents.wantsShadow, true),
        isNotNull(prospectiveStudents.shadowDate),
      ),
    );
  return rows
    .map((r) => r.date)
    .filter((d): d is string => !!d)
    .sort();
}

export type ProspectiveRow = {
  id: string;
  fullName: string;
  grade: number | null;
  gender: "M" | "F" | null;
  interests: { interestId: string; name: string; priority: number }[];
};

export type HostRow = {
  id: string;
  fullName: string;
  grade: number | null;
  gender: "M" | "F" | null;
  dayType: "green" | "gold" | null;
  academicBlocks: {
    blockLabel: string;
    courseTitle: string | null;
    coveredInterestIds: string[];
  }[];
  currentVisitCount: number;
};

export type MatchData = {
  date: string;
  softCap: number;
  prospectives: ProspectiveRow[];
  hosts: HostRow[];
  interestName: Map<string, string>;
  rankings: RankedMatch[];
};

export async function getMatchDataForDate(date: string): Promise<MatchData> {
  const softCap = await getSoftCap();

  const allInterests = await db.select().from(interests);
  const interestRefs: InterestRef[] = allInterests.map((i) => ({
    id: i.id,
    name: i.name,
    category: i.category,
  }));
  const interestName = new Map(allInterests.map((i) => [i.id, i.name]));

  // --- Prospectives for this date ---
  const pRows = await db
    .select()
    .from(prospectiveStudents)
    .where(
      and(
        eq(prospectiveStudents.wantsShadow, true),
        eq(prospectiveStudents.shadowDate, date),
      ),
    );
  const pIds = pRows.map((p) => p.id);
  const pInterests = pIds.length
    ? await db
        .select()
        .from(prospectiveInterests)
        .where(inArray(prospectiveInterests.prospectiveId, pIds))
    : [];

  const prospectives: ProspectiveRow[] = pRows.map((p) => ({
    id: p.id,
    fullName: p.fullName,
    grade: p.grade,
    gender: p.gender,
    interests: pInterests
      .filter((pi) => pi.prospectiveId === p.id)
      .sort((a, b) => a.priority - b.priority)
      .map((pi) => ({
        interestId: pi.interestId,
        name: interestName.get(pi.interestId) ?? "?",
        priority: pi.priority,
      })),
  }));

  // --- Hosts with a schedule on this date ---
  const dayRows = await db
    .select()
    .from(hostScheduleDays)
    .where(eq(hostScheduleDays.date, date));
  const hostIds = [...new Set(dayRows.map((d) => d.hostStudentId))];

  const hostRecords = hostIds.length
    ? await db.select().from(hostStudents).where(inArray(hostStudents.id, hostIds))
    : [];
  const dayIds = dayRows.map((d) => d.id);
  const blocks = dayIds.length
    ? await db
        .select()
        .from(hostScheduleBlocks)
        .where(inArray(hostScheduleBlocks.scheduleDayId, dayIds))
    : [];
  const hostInterestRows = hostIds.length
    ? await db
        .select()
        .from(hostStudentInterests)
        .where(inArray(hostStudentInterests.hostStudentId, hostIds))
    : [];

  // Confirmed/sent visit counts per host.
  const counts = await db
    .select({ hostStudentId: matches.hostStudentId, n: sql<number>`count(*)::int` })
    .from(matches)
    .where(inArray(matches.status, ["confirmed", "sent"]))
    .groupBy(matches.hostStudentId);
  const countMap = new Map(counts.map((c) => [c.hostStudentId, c.n]));

  const hosts: HostRow[] = hostRecords.map((h) => {
    const day = dayRows.find((d) => d.hostStudentId === h.id);
    const dayBlocks = blocks.filter((b) => b.scheduleDayId === day?.id);
    const academic = dayBlocks
      .filter((b) => b.isAcademic)
      .map((b) => ({
        blockLabel: b.blockLabel,
        courseTitle: b.courseTitle,
        coveredInterestIds: courseCoveredInterestIds(
          b.courseTitle,
          b.courseCode,
          interestRefs,
        ),
      }));
    return {
      id: h.id,
      fullName: h.fullName,
      grade: h.grade,
      gender: h.gender,
      dayType: (day?.dayType as "green" | "gold" | null) ?? null,
      academicBlocks: academic,
      currentVisitCount: countMap.get(h.id) ?? 0,
    };
  });

  // --- Run the engine ---
  const engineProspectives: ProspectiveForMatch[] = prospectives.map((p) => ({
    prospectiveId: p.id,
    grade: p.grade,
    gender: p.gender,
    interests: p.interests.map((i) => ({ interestId: i.interestId, priority: i.priority })),
  }));
  const engineHosts: HostForMatch[] = hosts.map((h) => ({
    hostStudentId: h.id,
    fullName: h.fullName,
    grade: h.grade,
    gender: h.gender,
    interestIds: hostInterestRows
      .filter((hi) => hi.hostStudentId === h.id)
      .map((hi) => hi.interestId),
    dayType: h.dayType,
    academicBlocks: h.academicBlocks.map((b) => ({
      blockLabel: b.blockLabel,
      courseTitle: b.courseTitle,
      courseCode: null,
      coveredInterestIds: b.coveredInterestIds,
    })),
    currentVisitCount: h.currentVisitCount,
  }));

  const rankings = assignBulk(engineProspectives, engineHosts, { hostSoftCap: softCap });

  return { date, softCap, prospectives, hosts, interestName, rankings };
}
