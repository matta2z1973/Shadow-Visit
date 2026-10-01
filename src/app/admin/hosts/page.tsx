import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  hostStudents,
  hostStudentInterests,
  hostScheduleDays,
  matches,
  appSettings,
  interests,
  profiles,
} from "@/lib/db/schema";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import HostsTabs from "@/components/hosts-tabs";
import PageLoadError from "@/components/page-load-error";
import HostsTable, { type HostRow, type InterestOption } from "./hosts-table";
import { newRequestId, timed } from "@/lib/debug-timing";

export const dynamic = "force-dynamic";

async function getSoftCap(): Promise<number> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, "host_soft_cap"))
    .limit(1);
  const n = row ? parseInt(row.value, 10) : 5;
  return Number.isFinite(n) ? n : 5;
}

// What the roster query returns: the host columns the table renders, plus
// the claimed profile's email (null until the student logs in).
type HostRosterRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  grade: number | null;
  gender: "M" | "F" | null;
  active: boolean;
  icsUrl: string | null;
  email: string | null;
};

export default async function HostsPage() {
  await requireAdmin();

  type HostsPageData = {
    softCap: number;
    hosts: HostRosterRow[];
    allInterests: (typeof interests.$inferSelect)[];
    hostInterestRows: (typeof hostStudentInterests.$inferSelect)[];
    countMap: Map<string, number>;
    scheduleCountMap: Map<string, number>;
  };
  let pageData: HostsPageData;
  const reqId = newRequestId();
  console.log(`[debug ${reqId}] HostsPage: render started`);
  try {
    const softCap = await timed(reqId, "hosts: soft cap", getSoftCap());
    // 5 concurrent queries here used to hang unpredictably whichever one
    // didn't get one of only 4 pooled connections (see src/lib/db/index.ts
    // for the max:10 fix and how a reordering test on 2026-08-31 proved it
    // was a pool-size issue, not any particular query or table).
    const [scheduleCounts, hosts, allInterests, hostInterestRows, counts] = await Promise.all([
      timed(
        reqId,
        "hosts: schedule-day counts",
        db
          .select({ hostStudentId: hostScheduleDays.hostStudentId, n: sql<number>`count(*)::int` })
          .from(hostScheduleDays)
          .groupBy(hostScheduleDays.hostStudentId),
      ),
      timed(
        reqId,
        "hosts: host roster",
        // Email lives on profiles, not host_students — a host only has one
        // once they've logged in and claimed their record. Left join so
        // admin-created rows (CSV/seed import, no profile yet) still appear,
        // just with no address to copy.
        db
          .select({
            id: hostStudents.id,
            firstName: hostStudents.firstName,
            lastName: hostStudents.lastName,
            fullName: hostStudents.fullName,
            grade: hostStudents.grade,
            gender: hostStudents.gender,
            active: hostStudents.active,
            icsUrl: hostStudents.icsUrl,
            email: profiles.email,
          })
          .from(hostStudents)
          .leftJoin(profiles, eq(hostStudents.profileId, profiles.id))
          .orderBy(asc(hostStudents.fullName)),
      ),
      timed(
        reqId,
        "hosts: active interests",
        db
          .select()
          .from(interests)
          .where(and(eq(interests.active, true), eq(interests.hostSelectable, true)))
          .orderBy(asc(interests.category), asc(interests.name)),
      ),
      timed(reqId, "hosts: host-interest links", db.select().from(hostStudentInterests)),
      timed(
        reqId,
        "hosts: visit counts",
        db
          .select({ hostStudentId: matches.hostStudentId, n: sql<number>`count(*)::int` })
          .from(matches)
          .where(inArray(matches.status, ["confirmed", "sent"]))
          .groupBy(matches.hostStudentId),
      ),
    ]);
    console.log(`[debug ${reqId}] HostsPage: all queries completed, rendering`);
    pageData = {
      softCap,
      hosts,
      allInterests,
      hostInterestRows,
      countMap: new Map(counts.map((c) => [c.hostStudentId as string, c.n])),
      scheduleCountMap: new Map(scheduleCounts.map((c) => [c.hostStudentId, c.n])),
    };
  } catch (err) {
    console.error(`[debug ${reqId}] HostsPage: failed to load data`, err);
    return <PageLoadError />;
  }
  const { softCap, hosts, allInterests, hostInterestRows, countMap, scheduleCountMap } = pageData;

  // Summary counts by grade (desc) and gender.
  const byGrade = new Map<number, number>();
  let male = 0;
  let female = 0;
  let noGender = 0;
  let noGrade = 0;
  for (const h of hosts) {
    if (h.grade == null) noGrade++;
    else byGrade.set(h.grade, (byGrade.get(h.grade) ?? 0) + 1);
    if (h.gender === "M") male++;
    else if (h.gender === "F") female++;
    else noGender++;
  }
  const gradesDesc = [...byGrade.entries()].sort((a, b) => b[0] - a[0]);
  // A host has a schedule if they've saved a calendar link (the live,
  // going-forward path) or have legacy CSV-imported rows on file.
  const hasSchedule = (id: string, icsUrl: string | null) =>
    !!icsUrl || !!scheduleCountMap.get(id);
  const missingSchedule = hosts.filter((h) => !hasSchedule(h.id, h.icsUrl)).length;

  // One pass to group interest links by host, rather than re-scanning the
  // whole link table once per host — the interests filter means every row's
  // links are needed, so this is now on the critical path for the page.
  const interestsByHost = new Map<string, string[]>();
  for (const r of hostInterestRows) {
    const list = interestsByHost.get(r.hostStudentId);
    if (list) list.push(r.interestId);
    else interestsByHost.set(r.hostStudentId, [r.interestId]);
  }

  const rows: HostRow[] = hosts.map((h) => ({
    id: h.id,
    firstName: h.firstName,
    lastName: h.lastName,
    fullName: h.fullName,
    grade: h.grade,
    gender: h.gender,
    active: h.active,
    icsUrl: h.icsUrl,
    visits: countMap.get(h.id) ?? 0,
    hasSchedule: hasSchedule(h.id, h.icsUrl),
    email: h.email,
    interestIds: interestsByHost.get(h.id) ?? [],
  }));

  const interestOptions: InterestOption[] = allInterests.map((i) => ({
    id: i.id,
    name: i.name,
    category: i.category,
  }));

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Hosts</h1>
        <span className="text-sm text-zinc-500">
          {hosts.length} hosts · soft cap {softCap}/host
        </span>
      </div>

      <HostsTabs active="roster" />

      {hosts.length > 0 ? (
        <div className="mt-5 flex flex-wrap gap-6 rounded-lg border border-zinc-200 bg-zinc-50 px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              By grade
            </div>
            <div className="mt-1.5 flex flex-wrap gap-2 text-sm">
              {gradesDesc.map(([grade, n]) => (
                <span key={grade} className="rounded bg-white px-2 py-0.5 dark:bg-zinc-800">
                  Grade {grade}: <strong>{n}</strong>
                </span>
              ))}
              {noGrade > 0 ? (
                <span className="rounded bg-white px-2 py-0.5 text-zinc-500 dark:bg-zinc-800">
                  No grade: <strong>{noGrade}</strong>
                </span>
              ) : null}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              By gender
            </div>
            <div className="mt-1.5 flex flex-wrap gap-2 text-sm">
              <span className="rounded bg-white px-2 py-0.5 dark:bg-zinc-800">
                Male: <strong>{male}</strong>
              </span>
              <span className="rounded bg-white px-2 py-0.5 dark:bg-zinc-800">
                Female: <strong>{female}</strong>
              </span>
              {noGender > 0 ? (
                <span className="rounded bg-white px-2 py-0.5 text-zinc-500 dark:bg-zinc-800">
                  Unset: <strong>{noGender}</strong>
                </span>
              ) : null}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Schedules
            </div>
            <div className="mt-1.5 flex flex-wrap gap-2 text-sm">
              {missingSchedule > 0 ? (
                <span className="rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                  {missingSchedule} haven&rsquo;t saved a calendar link
                </span>
              ) : (
                <span className="rounded bg-white px-2 py-0.5 text-zinc-500 dark:bg-zinc-800">
                  All hosts have a calendar link on file
                </span>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <HostsTable hosts={rows} allInterests={interestOptions} softCap={softCap} />
    </main>
  );
}
