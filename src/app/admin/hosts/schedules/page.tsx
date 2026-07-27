import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  hostStudents,
  hostScheduleDays,
  hostScheduleBlocks,
} from "@/lib/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import HostsTabs from "@/components/hosts-tabs";
import ScheduleCompare, { type HostData } from "./schedule-compare";

export const dynamic = "force-dynamic";

export default async function SchedulesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const dateRows = await db
    .selectDistinct({ date: hostScheduleDays.date })
    .from(hostScheduleDays)
    .orderBy(asc(hostScheduleDays.date));
  const dates = dateRows.map((r) => r.date);
  const date = sp.date ?? dates[0];

  if (!date) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Schedules</h1>
        <HostsTabs active="schedules" />
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          No host schedules uploaded yet.
        </p>
      </main>
    );
  }

  const days = await db
    .select()
    .from(hostScheduleDays)
    .where(eq(hostScheduleDays.date, date));
  const dayByHost = new Map(days.map((d) => [d.hostStudentId, d]));
  const hostIds = days.map((d) => d.hostStudentId);

  const hostRows = hostIds.length
    ? await db
        .select()
        .from(hostStudents)
        .where(inArray(hostStudents.id, hostIds))
        .orderBy(asc(hostStudents.fullName))
    : [];
  const blocks = days.length
    ? await db
        .select()
        .from(hostScheduleBlocks)
        .where(inArray(hostScheduleBlocks.scheduleDayId, days.map((d) => d.id)))
    : [];

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
    };
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Schedules</h1>
        <form className="flex items-center gap-2 text-sm">
          <label htmlFor="date" className="text-zinc-500">
            Date
          </label>
          <select
            id="date"
            name="date"
            defaultValue={date}
            className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          >
            {dates.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <button className="rounded-md border border-zinc-300 px-3 py-1 dark:border-zinc-700">
            Load
          </button>
        </form>
      </div>

      <HostsTabs active="schedules" />

      <ScheduleCompare date={date} hosts={hostsData} />
    </main>
  );
}
