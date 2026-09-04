import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { matches, staff } from "@/lib/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import { getMatchDataForDateRange, type MatchData } from "@/lib/matching/loader";
import { getOpenInterviewSlotsByProspective } from "@/lib/matching/interview-slots";
import { confirmMatch, bulkConfirmBest } from "./actions";
import { INTERVIEW_TIME_BLOCKS } from "@/lib/schedule/interview-blocks";
import EmailSchedulesButton from "./email-schedules-button";
import PageLoadError from "@/components/page-load-error";
import HostPicker, { type HostOption } from "./host-picker";

export const dynamic = "force-dynamic";

function Chip({ children, tone = "zinc" }: { children: React.ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    zinc: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    green: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    red: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

// Next calendar week's Monday-Friday, relative to today — the sensible
// default for a weekly batch of shadow visits. Works out to the upcoming
// Monday for any day Sun-Sat except Monday itself, which jumps a full week
// ahead rather than pointing at today.
function defaultNextWeekRange(): { start: string; end: string } {
  const today = new Date();
  const day = today.getDay(); // 0=Sun..6=Sat
  const daysUntilMonday = ((8 - day) % 7) || 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() + daysUntilMonday);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(monday), end: fmt(friday) };
}

function DateRangeForm({ start, end }: { start: string; end: string }) {
  return (
    <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">From</span>
        <input
          type="date"
          name="start"
          defaultValue={start}
          required
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Through</span>
        <input
          type="date"
          name="end"
          defaultValue={end}
          required
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      <button
        type="submit"
        className="rounded-md bg-forest px-4 py-2 text-sm font-medium text-white dark:bg-forest dark:text-white"
      >
        Run match
      </button>
    </form>
  );
}

type StaffRow = typeof staff.$inferSelect;
type MatchRow = typeof matches.$inferSelect;
type OpenSlots = Awaited<ReturnType<typeof getOpenInterviewSlotsByProspective>>;

function DateSection({
  data,
  admissionsStaff,
  matchByProspective,
  openSlots,
  timeBlockLabel,
}: {
  data: MatchData;
  admissionsStaff: StaffRow[];
  matchByProspective: Map<string, MatchRow>;
  openSlots: OpenSlots;
  timeBlockLabel: Map<string, string>;
}) {
  const hostById = new Map(data.hosts.map((h) => [h.id, h]));
  const hostName = new Map(data.hosts.map((h) => [h.id, h.fullName]));

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-2 dark:border-zinc-800">
        <h2 className="text-lg font-semibold">{data.date}</h2>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/match/export?date=${data.date}`}
            prefetch={false}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            Export CSV
          </Link>
          <form action={bulkConfirmBest}>
            <input type="hidden" name="date" value={data.date} />
            <button className="rounded-md bg-forest px-3 py-1.5 text-sm font-medium text-white dark:bg-forest dark:text-white">
              Confirm best for all
            </button>
          </form>
          <EmailSchedulesButton date={data.date} />
        </div>
      </div>

      <div className="mt-2 flex items-center gap-4 text-sm text-zinc-600 dark:text-zinc-400">
        <span>{data.prospectives.length} prospective(s)</span>
        <span>{data.hosts.length} active host(s)</span>
        <span>soft cap {data.softCap}</span>
      </div>

      <div className="mt-4 space-y-5">
        {data.prospectives.map((p) => {
          const ranking = data.rankings.find((r) => r.prospectiveId === p.id);
          const best = ranking?.best ?? null;
          const confirmed = matchByProspective.get(p.id);

          return (
            <div key={p.id} className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">
                  {p.fullName}{" "}
                  <span className="text-sm text-zinc-500">
                    grade {p.grade ?? "?"} · {p.gender ?? "?"}
                  </span>
                </div>
                {confirmed ? (
                  <div className="flex items-center gap-2">
                    <Chip tone="green">
                      confirmed → {hostName.get(confirmed.hostStudentId ?? "") ?? "unassigned"}
                    </Chip>
                    <Link
                      href={`/admin/schedule/${confirmed.id}`}
                      prefetch={false}
                      className="text-xs underline-offset-2 hover:underline"
                    >
                      Schedule / .ics
                    </Link>
                  </div>
                ) : null}
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {p.interests.map((i) => (
                  <Chip key={i.interestId} tone={i.priority === 0 ? "amber" : "zinc"}>
                    {i.priority === 0 ? "Academic interest: " : `#${i.priority} `}
                    {i.name}
                  </Chip>
                ))}
              </div>

              {ranking && ranking.ranked.length === 0 ? (
                <p className="mt-3 text-sm text-red-700 dark:text-red-400">
                  No eligible host (grade + gender). Consider an alternate date or host.
                </p>
              ) : (
                <form action={confirmMatch} className="mt-4 flex flex-wrap items-end gap-3">
                  <input type="hidden" name="prospectiveId" value={p.id} />
                  <input type="hidden" name="shadowDate" value={data.date} />

                  <HostPicker
                    options={(ranking?.ranked ?? []).map(
                      (h): HostOption => ({
                        hostStudentId: h.hostStudentId,
                        fullName: h.fullName,
                        score: h.score,
                        freePeriodCount: h.freePeriodCount,
                        overCap: h.overCap,
                        coveredCount: h.coveredCount,
                        totalInterests: p.interests.length,
                        coverage: h.coverage.map((c) => ({
                          name: data.interestName.get(c.interestId) ?? "?",
                          priority: c.priority,
                          covered: c.covered,
                          via: c.via,
                          blockLabel: c.blockLabel,
                        })),
                        hasCalendar: hostById.get(h.hostStudentId)?.hasCalendar ?? false,
                        usedScheduleMatching: h.usedScheduleMatching,
                      }),
                    )}
                    defaultHostId={confirmed?.hostStudentId ?? best?.hostStudentId ?? ""}
                  />

                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium">Interview slot</span>
                    <select
                      name="interviewSlot"
                      defaultValue={
                        confirmed && p.interviewerStaffId && p.interviewStart
                          ? `${p.interviewerStaffId}::${p.interviewStart.slice(0, 5)}`
                          : ""
                      }
                      className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      <option value="">—</option>
                      {admissionsStaff.map((s) => {
                        const slots = (openSlots.get(p.id) ?? []).filter((slot) => slot.staffId === s.id);
                        if (!slots.length) return null;
                        return (
                          <optgroup key={s.id} label={s.fullName}>
                            {slots.map((slot) => (
                              <option key={slot.start} value={`${s.id}::${slot.start}`}>
                                {timeBlockLabel.get(slot.start) ?? slot.start}
                              </option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                  </label>

                  <button className="rounded-md bg-forest px-4 py-2 text-sm font-medium text-white dark:bg-forest dark:text-white">
                    {confirmed ? "Update" : "Confirm"}
                  </button>
                </form>
              )}

              {best && best.flags.length ? (
                <div className="mt-3 flex flex-wrap gap-1">
                  {best.flags.map((f, idx) => (
                    <Chip key={idx} tone="amber">
                      {f.message}
                    </Chip>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default async function MatchPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  await requireAdmin();
  const { start: startParam, end: endParam } = await searchParams;
  const defaults = defaultNextWeekRange();
  const hasRange = !!(startParam && endParam);
  const start = startParam ?? defaults.start;
  const end = endParam ?? defaults.end;

  let dateGroups: MatchData[] = [];
  let admissionsStaff: StaffRow[] = [];
  let matchByProspective: Map<string, MatchRow> = new Map();
  let openSlotsByDate: Map<string, OpenSlots> = new Map();

  if (hasRange) {
    try {
      dateGroups = await getMatchDataForDateRange(start, end);

      admissionsStaff = await db
        .select()
        .from(staff)
        .where(eq(staff.kind, "admissions"))
        .orderBy(asc(staff.fullName));

      const allProspectiveIds = dateGroups.flatMap((g) => g.prospectives.map((p) => p.id));
      const existing = allProspectiveIds.length
        ? await db.select().from(matches).where(inArray(matches.prospectiveId, allProspectiveIds))
        : [];
      matchByProspective = new Map(existing.map((m) => [m.prospectiveId, m]));

      for (const group of dateGroups) {
        const slots = await getOpenInterviewSlotsByProspective(group.date, group.prospectives.map((p) => p.id));
        openSlotsByDate.set(group.date, slots);
      }
    } catch (err) {
      console.error("MatchPage: failed to load data", err);
      return <PageLoadError />;
    }
  }

  const timeBlockLabel = new Map(INTERVIEW_TIME_BLOCKS.map((b) => [b.start, b.label]));

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Run matching</h1>

      <DateRangeForm start={start} end={end} />

      <p className="mt-3 text-sm text-zinc-500">
        Only prospectives with a shadow date in this range are matched. Host schedules shown here
        are a snapshot —{" "}
        <Link href="/admin/hosts/schedules" prefetch={false} className="underline">
          Refresh schedules
        </Link>{" "}
        before matching if calendars may have changed.
      </p>

      <details className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <summary className="cursor-pointer font-medium">How matching works</summary>
        <div className="mt-2 space-y-2 text-zinc-600 dark:text-zinc-400">
          <p>
            Each prospective lists one{" "}
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              Academic interest
            </span>{" "}
            — the single subject they said they most want to see, weighted highest — plus up to 4
            ranked extracurricular interests, <strong>#1</strong> (most wanted) through{" "}
            <strong>#4</strong> (least).
          </p>
          <p>
            Upper School (9-12) hosts score points for every interest they cover: more for a
            higher-ranked interest, plus a bonus if the prospective would actually sit in that
            class during the visit — a host without a calendar on file can still be matched on
            interests alone, they just can&rsquo;t earn that class-coverage bonus. Points are then
            subtracted for each free period the host has during the visit, and again if the host
            is already at or over their soft visit cap. Middle School (5-8) matches on interests
            only — class schedule isn&rsquo;t used for that grade band yet. Pick a host below and
            open &ldquo;Why this score?&rdquo; to see the exact breakdown.
          </p>
        </div>
      </details>

      {!hasRange ? (
        <p className="mt-6 text-sm text-zinc-500">
          Pick a date range above and click &ldquo;Run match&rdquo; to see results.
        </p>
      ) : dateGroups.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          No prospective students want a shadow visit between {start} and {end}. Upload a
          FinalSite bulk report on the{" "}
          <Link href="/admin/prospectives/upload" prefetch={false} className="underline">
            Upload
          </Link>{" "}
          tab under Prospectives, or pick a different range.
        </p>
      ) : (
        dateGroups.map((data) => (
          <DateSection
            key={data.date}
            data={data}
            admissionsStaff={admissionsStaff}
            matchByProspective={matchByProspective}
            openSlots={openSlotsByDate.get(data.date) ?? new Map()}
            timeBlockLabel={timeBlockLabel}
          />
        ))
      )}
    </main>
  );
}
