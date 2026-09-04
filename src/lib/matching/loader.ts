import { db } from "@/lib/db";
import {
  hostStudents,
  hostScheduleDays,
  hostScheduleBlocks,
  hostStudentInterests,
  prospectiveStudents,
  prospectiveInterests,
  interests,
  courses,
  matches,
  appSettings,
} from "@/lib/db/schema";
import { and, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import {
  assignBulk,
  type HostForMatch,
  type ProspectiveForMatch,
  type RankedMatch,
} from "./engine";
import {
  courseCoveredInterestIds,
  type InterestRef,
  type CourseCatalogEntry,
  type SemanticMatchContext,
} from "./course-map";
import { embedTexts, EmbeddingsNotConfiguredError } from "@/lib/llm/embeddings";

// Builds the embeddings-based matching context: the course catalog (if any
// has been uploaded on /admin/settings) plus an embedding per interest,
// computed once and cached on the interests row so repeat match runs don't
// re-call the embeddings API. Returns undefined (pure keyword fallback) if
// no catalog is loaded or no OpenAI key is configured.
async function buildSemanticContext(
  interestRows: (typeof interests.$inferSelect)[],
): Promise<SemanticMatchContext | undefined> {
  const catalogRows = await db.select().from(courses);
  if (catalogRows.length === 0) return undefined;

  const catalog: CourseCatalogEntry[] = catalogRows.map((c) => ({
    code: c.code,
    title: c.title,
    embedding: (c.embedding as number[] | null) ?? null,
  }));

  const interestEmbeddings = new Map<string, number[]>();
  for (const i of interestRows) {
    if (i.embedding) interestEmbeddings.set(i.id, i.embedding as number[]);
  }

  const missing = interestRows.filter((i) => !i.embedding);
  if (missing.length) {
    try {
      const embedded = await embedTexts(missing.map((i) => i.name));
      for (let idx = 0; idx < missing.length; idx++) {
        const embedding = embedded[idx];
        interestEmbeddings.set(missing[idx].id, embedding);
        await db
          .update(interests)
          .set({ embedding })
          .where(eq(interests.id, missing[idx].id));
      }
    } catch (err) {
      if (!(err instanceof EmbeddingsNotConfiguredError)) {
        console.error("Failed to embed interests for semantic matching:", err);
      }
      // Fall back to whatever embeddings were already cached — matching
      // degrades to keyword-only for any interest still missing one.
    }
  }

  if (interestEmbeddings.size === 0) return undefined;
  return { catalog, interestEmbeddings };
}

export async function getSoftCap(): Promise<number> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, "host_soft_cap"))
    .limit(1);
  const n = row ? parseInt(row.value, 10) : 5;
  return Number.isFinite(n) ? n : 5;
}

export type ProspectiveRow = {
  id: string;
  fullName: string;
  grade: number | null;
  gender: "M" | "F" | null;
  interests: { interestId: string; name: string; priority: number }[];
  interviewerStaffId: string | null;
  interviewStart: string | null;
  interviewEnd: string | null;
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
  // Whether this host has ever saved a calendar link — a host with none can
  // still be matched (calendar/class coverage is a bonus, not a
  // requirement), but the admin needs to know matching couldn't see their
  // classes for that date. See admin/match's host picker.
  hasCalendar: boolean;
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

// Data shared across every date in a batch run — fetched once regardless of
// how many dates are being matched, since none of it is date-specific
// (unlike each host's day-to-day class schedule).
type SharedMatchContext = {
  softCap: number;
  interestRefs: InterestRef[];
  interestName: Map<string, string>;
  semantic: SemanticMatchContext | undefined;
  hostRecords: (typeof hostStudents.$inferSelect)[];
  hostIds: string[];
  hostInterestRows: (typeof hostStudentInterests.$inferSelect)[];
  baselineVisitCounts: Map<string, number>;
};

async function loadSharedMatchContext(): Promise<SharedMatchContext> {
  const softCap = await getSoftCap();

  const allInterests = await db.select().from(interests);
  const interestRefs: InterestRef[] = allInterests.map((i) => ({
    id: i.id,
    name: i.name,
    category: i.category,
  }));
  const interestName = new Map(allInterests.map((i) => [i.id, i.name]));
  const semantic = await buildSemanticContext(allInterests);

  // Every active host is a candidate regardless of whether they have a
  // synced schedule for any given date — a missing calendar just means no
  // class-coverage bonus for that host, it doesn't disqualify them (see
  // engine.ts). Previously this list came from host_schedule_days, which
  // silently dropped any host without a schedule row from matching
  // entirely.
  const hostRecords = await db.select().from(hostStudents).where(eq(hostStudents.active, true));
  const hostIds = hostRecords.map((h) => h.id);
  const hostInterestRows = hostIds.length
    ? await db.select().from(hostStudentInterests).where(inArray(hostStudentInterests.hostStudentId, hostIds))
    : [];

  // Confirmed/sent visit counts per host — the starting point for the soft
  // cap and tie-breaker; a batch run over several dates increments this
  // further per date as it goes (see buildMatchDataForDates).
  const counts = await db
    .select({ hostStudentId: matches.hostStudentId, n: sql<number>`count(*)::int` })
    .from(matches)
    .where(inArray(matches.status, ["confirmed", "sent"]))
    .groupBy(matches.hostStudentId);
  const baselineVisitCounts = new Map(hostRecords.map((h) => [h.id, 0]));
  for (const c of counts) {
    if (c.hostStudentId) baselineVisitCounts.set(c.hostStudentId, c.n);
  }

  return { softCap, interestRefs, interestName, semantic, hostRecords, hostIds, hostInterestRows, baselineVisitCounts };
}

// Builds match data for every date in `dates` that actually has a
// prospective wanting a shadow visit, sharing one fetch of hosts/interests
// across all of them. Host visit counts carry forward from one date to the
// next within this same call (in date order) so a multi-day batch run
// load-balances across the whole range, not just within each day.
async function buildMatchDataForDates(dates: string[]): Promise<MatchData[]> {
  if (!dates.length) return [];
  const ctx = await loadSharedMatchContext();

  const pRows = dates.length
    ? await db
        .select()
        .from(prospectiveStudents)
        .where(and(eq(prospectiveStudents.wantsShadow, true), inArray(prospectiveStudents.shadowDate, dates)))
    : [];
  const pIds = pRows.map((p) => p.id);
  const pInterests = pIds.length
    ? await db.select().from(prospectiveInterests).where(inArray(prospectiveInterests.prospectiveId, pIds))
    : [];

  // Host schedules are a snapshot — populated by the explicit "Refresh
  // schedules" button on /admin/hosts/schedules (see ics-sync.ts), not
  // re-fetched from Outlook here. Matching just reads whatever was last
  // synced, same as every other view built on these tables. Fetched for
  // every date in the batch at once rather than one query per date.
  const dayRows = ctx.hostIds.length
    ? await db
        .select()
        .from(hostScheduleDays)
        .where(and(inArray(hostScheduleDays.hostStudentId, ctx.hostIds), inArray(hostScheduleDays.date, dates)))
    : [];
  const dayIds = dayRows.map((d) => d.id);
  const blocks = dayIds.length
    ? await db.select().from(hostScheduleBlocks).where(inArray(hostScheduleBlocks.scheduleDayId, dayIds))
    : [];

  const liveCounts = new Map(ctx.baselineVisitCounts);
  const results: MatchData[] = [];

  for (const date of dates) {
    const pRowsForDate = pRows.filter((p) => p.shadowDate === date);
    if (!pRowsForDate.length) continue;

    const prospectives: ProspectiveRow[] = pRowsForDate.map((p) => ({
      id: p.id,
      fullName: p.fullName,
      grade: p.grade,
      gender: p.gender,
      interviewerStaffId: p.interviewerStaffId,
      interviewStart: p.interviewStart,
      interviewEnd: p.interviewEnd,
      interests: pInterests
        .filter((pi) => pi.prospectiveId === p.id)
        .sort((a, b) => a.priority - b.priority)
        .map((pi) => ({
          interestId: pi.interestId,
          name: ctx.interestName.get(pi.interestId) ?? "?",
          priority: pi.priority,
        })),
    }));

    const dayRowsForDate = dayRows.filter((d) => d.date === date);
    const hosts: HostRow[] = ctx.hostRecords.map((h) => {
      const day = dayRowsForDate.find((d) => d.hostStudentId === h.id);
      const dayBlocks = blocks.filter((b) => b.scheduleDayId === day?.id);
      const academic = dayBlocks
        .filter((b) => b.isAcademic)
        .map((b) => ({
          blockLabel: b.blockLabel,
          courseTitle: b.courseTitle,
          coveredInterestIds: courseCoveredInterestIds(b.courseTitle, b.courseCode, ctx.interestRefs, ctx.semantic),
        }));
      return {
        id: h.id,
        fullName: h.fullName,
        grade: h.grade,
        gender: h.gender,
        dayType: (day?.dayType as "green" | "gold" | null) ?? null,
        academicBlocks: academic,
        hasCalendar: !!h.icsUrl,
        currentVisitCount: liveCounts.get(h.id) ?? 0,
      };
    });

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
      interestIds: ctx.hostInterestRows
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

    const rankings = assignBulk(engineProspectives, engineHosts, { hostSoftCap: ctx.softCap });
    for (const r of rankings) {
      if (r.best) liveCounts.set(r.best.hostStudentId, (liveCounts.get(r.best.hostStudentId) ?? 0) + 1);
    }

    results.push({ date, softCap: ctx.softCap, prospectives, hosts, interestName: ctx.interestName, rankings });
  }

  return results;
}

export async function getMatchDataForDate(date: string): Promise<MatchData> {
  const [data] = await buildMatchDataForDates([date]);
  if (data) return data;
  // No prospective wants a shadow visit on this date — still return a valid
  // (empty) shape rather than throwing.
  return {
    date,
    softCap: await getSoftCap(),
    prospectives: [],
    hosts: [],
    interestName: new Map(),
    rankings: [],
  };
}

// One matching run across every date in [startDate, endDate] that has at
// least one prospective wanting a shadow visit — the batch-run entry point
// for /admin/match's date-range picker.
export async function getMatchDataForDateRange(startDate: string, endDate: string): Promise<MatchData[]> {
  const rows = await db
    .selectDistinct({ date: prospectiveStudents.shadowDate })
    .from(prospectiveStudents)
    .where(
      and(
        eq(prospectiveStudents.wantsShadow, true),
        isNotNull(prospectiveStudents.shadowDate),
        gte(prospectiveStudents.shadowDate, startDate),
        lte(prospectiveStudents.shadowDate, endDate),
      ),
    );
  const dates = rows
    .map((r) => r.date)
    .filter((d): d is string => !!d)
    .sort();
  return buildMatchDataForDates(dates);
}
