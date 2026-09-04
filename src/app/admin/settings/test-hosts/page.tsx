import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { hostStudentInterests, hostScheduleDays, hostScheduleBlocks, interests } from "@/lib/db/schema";
import { and, eq, inArray, asc } from "drizzle-orm";
import { getShadowSeason } from "@/lib/schedule/season";
import { listTestHosts } from "@/lib/schedule/test-hosts";
import { INTEREST_CATEGORIES } from "@/lib/interest-categories";
import SettingsTabs from "@/components/settings-tabs";
import PageLoadError from "@/components/page-load-error";
import CreateDefaultsButton from "./create-defaults-button";
import TestHostCard from "./test-host-card";

export const dynamic = "force-dynamic";

export default async function TestHostsPage() {
  await requireAdmin();

  let season: Awaited<ReturnType<typeof getShadowSeason>>;
  let hosts: Awaited<ReturnType<typeof listTestHosts>>;
  let allInterests: (typeof interests.$inferSelect)[];
  let interestIdsByHost: Map<string, string[]>;
  let courseByLetterByHost: Map<string, Record<string, string | null>>;
  try {
    [season, hosts, allInterests] = await Promise.all([
      getShadowSeason(),
      listTestHosts(),
      db
        .select()
        .from(interests)
        .where(and(eq(interests.active, true), eq(interests.hostSelectable, true)))
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

    // A test host's green days are all identical to each other, and likewise
    // for gold — so one representative day of each is enough to reconstruct
    // the full A-H picture for the editor.
    const repDaysByHost = new Map<string, { green?: (typeof dayRows)[number]; gold?: (typeof dayRows)[number] }>();
    for (const d of dayRows) {
      const entry = repDaysByHost.get(d.hostStudentId) ?? {};
      if (d.dayType === "green" && !entry.green) entry.green = d;
      if (d.dayType === "gold" && !entry.gold) entry.gold = d;
      repDaysByHost.set(d.hostStudentId, entry);
    }
    const repDayIds = [...repDaysByHost.values()].flatMap((e) => [e.green?.id, e.gold?.id]).filter((id): id is string => !!id);
    const blockRows = repDayIds.length
      ? await db.select().from(hostScheduleBlocks).where(inArray(hostScheduleBlocks.scheduleDayId, repDayIds))
      : [];

    courseByLetterByHost = new Map();
    for (const [hostId, days] of repDaysByHost) {
      const byLetter: Record<string, string | null> = {};
      for (const day of [days.green, days.gold]) {
        if (!day) continue;
        for (const b of blockRows.filter((r) => r.scheduleDayId === day.id)) {
          const letter = b.blockLabel.trim().charAt(0).toUpperCase();
          byLetter[letter] = b.courseTitle;
        }
      }
      courseByLetterByHost.set(hostId, byLetter);
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
        useful for trying out matching without needing a real host&rsquo;s calendar. Each has
        classes on both green (A–D) and gold (E–H) blocks; the season alternates between the two
        every weekday, so a test host&rsquo;s full 8-class schedule shows up across the season
        {season ? ` (${season.start} to ${season.end})` : " — none set yet, saving one will create a default season"}
        .
      </p>

      <div className="mt-6">
        <CreateDefaultsButton />
      </div>

      {hosts.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500">
          No test hosts yet — click &ldquo;Create default test hosts&rdquo; above for 4 ready-made
          ones (grades 9–12, mixed gender, 7 classes + 1 free block each, picked to match the
          built-in test prospective data), or none at all if you&rsquo;d rather build your own from
          scratch.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {hosts.map((h) => (
            <TestHostCard
              key={h.id}
              host={{ id: h.id, fullName: h.fullName, grade: h.grade, gender: h.gender }}
              courseByLetter={courseByLetterByHost.get(h.id) ?? {}}
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
