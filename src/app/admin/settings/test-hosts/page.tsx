import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { hostStudentInterests, hostScheduleDays, hostScheduleBlocks, interests } from "@/lib/db/schema";
import { eq, inArray, asc } from "drizzle-orm";
import { getShadowSeason } from "@/lib/schedule/season";
import { listTestHosts } from "@/lib/schedule/test-hosts";
import { INTEREST_CATEGORIES } from "@/lib/interest-categories";
import SettingsTabs from "@/components/settings-tabs";
import PageLoadError from "@/components/page-load-error";
import CreateDefaultsButton from "./create-defaults-button";
import TestHostCard from "./test-host-card";

export const dynamic = "force-dynamic";

type ScheduleInfo = {
  dayType: "green" | "gold" | null;
  blocks: { blockLabel: string; courseTitle: string | null; isAcademic: boolean }[];
};

export default async function TestHostsPage() {
  await requireAdmin();

  let season: Awaited<ReturnType<typeof getShadowSeason>>;
  let hosts: Awaited<ReturnType<typeof listTestHosts>>;
  let allInterests: (typeof interests.$inferSelect)[];
  let interestIdsByHost: Map<string, string[]>;
  let scheduleByHost: Map<string, ScheduleInfo>;
  try {
    [season, hosts, allInterests] = await Promise.all([
      getShadowSeason(),
      listTestHosts(),
      db
        .select()
        .from(interests)
        .where(eq(interests.active, true))
        .orderBy(asc(interests.category), asc(interests.name)),
    ]);

    const hostIds = hosts.map((h) => h.id);
    const [hostInterestRows, dayRows] = await Promise.all([
      hostIds.length
        ? db.select().from(hostStudentInterests).where(inArray(hostStudentInterests.hostStudentId, hostIds))
        : Promise.resolve([]),
      hostIds.length
        ? db.select().from(hostScheduleDays).where(inArray(hostScheduleDays.hostStudentId, hostIds))
        : Promise.resolve([]),
    ]);

    interestIdsByHost = new Map();
    for (const hi of hostInterestRows) {
      const list = interestIdsByHost.get(hi.hostStudentId) ?? [];
      list.push(hi.interestId);
      interestIdsByHost.set(hi.hostStudentId, list);
    }

    // A test host's schedule is identical every day, so one representative
    // day per host is enough to prefill the editor.
    const oneDayPerHost = new Map<string, (typeof dayRows)[number]>();
    for (const d of dayRows) {
      if (!oneDayPerHost.has(d.hostStudentId)) oneDayPerHost.set(d.hostStudentId, d);
    }
    const dayIds = [...oneDayPerHost.values()].map((d) => d.id);
    const blockRows = dayIds.length
      ? await db.select().from(hostScheduleBlocks).where(inArray(hostScheduleBlocks.scheduleDayId, dayIds))
      : [];

    scheduleByHost = new Map();
    for (const [hostId, day] of oneDayPerHost) {
      scheduleByHost.set(hostId, {
        dayType: (day.dayType as "green" | "gold" | null) ?? null,
        blocks: blockRows
          .filter((b) => b.scheduleDayId === day.id)
          .sort((a, b) => a.startTime.localeCompare(b.startTime))
          .map((b) => ({ blockLabel: b.blockLabel, courseTitle: b.courseTitle, isAcademic: b.isAcademic })),
      });
    }
  } catch (err) {
    console.error("TestHostsPage: failed to load data", err);
    return <PageLoadError />;
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Test hosts</h1>

      <SettingsTabs active="test-hosts" />

      <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        Practice hosts with a hand-entered schedule instead of a real Outlook calendar link —
        useful for trying out matching without needing a real host&rsquo;s calendar. A test
        host&rsquo;s schedule applies identically to every weekday in the current season
        {season ? ` (${season.start} to ${season.end})` : " — none set yet, saving one will create a default season"}
        .
      </p>

      <div className="mt-6">
        <CreateDefaultsButton />
      </div>

      {hosts.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500">
          No test hosts yet — click &ldquo;Create default test hosts&rdquo; above for 4 ready-made
          ones (grades 9–12, mixed gender, with class schedules picked to match the built-in test
          prospective data), or none at all if you&rsquo;d rather build your own from scratch.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {hosts.map((h) => (
            <TestHostCard
              key={h.id}
              host={{ id: h.id, fullName: h.fullName, grade: h.grade, gender: h.gender }}
              schedule={scheduleByHost.get(h.id) ?? null}
              selectedInterestIds={interestIdsByHost.get(h.id) ?? []}
              interestCategories={INTEREST_CATEGORIES}
              allInterests={allInterests.map((i) => ({ id: i.id, name: i.name, category: i.category }))}
            />
          ))}
        </div>
      )}
    </main>
  );
}
