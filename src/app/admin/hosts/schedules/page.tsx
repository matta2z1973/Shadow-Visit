import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  hostStudents,
  hostScheduleDays,
  hostScheduleBlocks,
  hostStudentInterests,
  interests,
} from "@/lib/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import HostsTabs from "@/components/hosts-tabs";
import PageLoadError from "@/components/page-load-error";
import RefreshSchedulesForm from "./refresh-schedules-form";
import ScheduleCompare, { type HostData } from "./schedule-compare";

export const dynamic = "force-dynamic";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function SchedulesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const date = sp.date ?? today();

  // Static reads — this tab never talks to Outlook itself. Data here is
  // whatever was last synced via the "Refresh schedules" button below.
  let hostRows: (typeof hostStudents.$inferSelect)[];
  let interestIdsByHost: Map<string, string[]>;
  let interestRows: (typeof interests.$inferSelect)[];
  let dayByHost: Map<string, typeof hostScheduleDays.$inferSelect>;
  let blocks: (typeof hostScheduleBlocks.$inferSelect)[];
  let lastUpdated: Date | null;
  try {
    hostRows = await db
      .select()
      .from(hostStudents)
      .where(eq(hostStudents.active, true))
      .orderBy(asc(hostStudents.fullName));
    const hostIds = hostRows.map((h) => h.id);

    let hostInterestRows: (typeof hostStudentInterests.$inferSelect)[];
    [hostInterestRows, interestRows] = await Promise.all([
      hostIds.length
        ? db
            .select()
            .from(hostStudentInterests)
            .where(inArray(hostStudentInterests.hostStudentId, hostIds))
        : Promise.resolve([]),
      db
        .select()
        .from(interests)
        .where(eq(interests.active, true))
        .orderBy(asc(interests.category), asc(interests.name)),
    ]);
    interestIdsByHost = new Map<string, string[]>();
    for (const hi of hostInterestRows) {
      const list = interestIdsByHost.get(hi.hostStudentId) ?? [];
      list.push(hi.interestId);
      interestIdsByHost.set(hi.hostStudentId, list);
    }

    const days = await db
      .select()
      .from(hostScheduleDays)
      .where(eq(hostScheduleDays.date, date));
    dayByHost = new Map(days.map((d) => [d.hostStudentId, d]));
    blocks = days.length
      ? await db
          .select()
          .from(hostScheduleBlocks)
          .where(inArray(hostScheduleBlocks.scheduleDayId, days.map((d) => d.id)))
      : [];

    lastUpdated = days.length
      ? days
          .map((d) => d.createdAt)
          .sort((a, b) => b.getTime() - a.getTime())[0]
      : null;
  } catch (err) {
    console.error("SchedulesPage: failed to load data", err);
    return <PageLoadError />;
  }

  // Plain, serializable data for the client comparison component.
  const hostsData: HostData[] = hostRows.map((h) => {
    const day = dayByHost.get(h.id);
    const byLetter: HostData["byLetter"] = {};
    for (const b of blocks) {
      if (b.scheduleDayId !== day?.id || !b.isAcademic) continue;
      const letter = b.blockLabel.trim().charAt(0).toUpperCase();
      byLetter[letter] = { course: b.courseTitle, teacher: b.teacher, room: b.room };
    }
    return {
      id: h.id,
      name: h.fullName,
      grade: h.grade,
      gender: h.gender,
      dayType: (day?.dayType as "green" | "gold" | null) ?? null,
      byLetter,
      interestIds: interestIdsByHost.get(h.id) ?? [],
    };
  });
  const interestOptions = interestRows.map((i) => ({ id: i.id, name: i.name }));

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Schedules</h1>
        <form className="flex items-center gap-2 text-sm">
          <label htmlFor="date" className="text-zinc-500">
            Date
          </label>
          <input
            id="date"
            name="date"
            type="date"
            defaultValue={date}
            className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button className="rounded-md border border-zinc-300 px-3 py-1 dark:border-zinc-700">
            Load
          </button>
        </form>
      </div>

      <HostsTabs active="schedules" />

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="text-zinc-600 dark:text-zinc-400">
          {lastUpdated ? (
            <>Last updated for {date}: {lastUpdated.toLocaleString()}</>
          ) : (
            <>Not synced for {date} yet.</>
          )}
          <div className="text-xs text-zinc-500">
            This tab is a snapshot — refresh manually with the button before
            running matching if calendars may have changed.
          </div>
        </div>
        <RefreshSchedulesForm date={date} />
      </div>

      {hostRows.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          No hosts yet.
        </p>
      ) : null}

      <ScheduleCompare date={date} hosts={hostsData} interestOptions={interestOptions} />
    </main>
  );
}
