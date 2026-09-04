import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { matches, staff } from "@/lib/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import {
  getShadowDates,
  getMatchDataForDate,
  type MatchData,
} from "@/lib/matching/loader";
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

export default async function MatchPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireAdmin();
  const { date: dateParam } = await searchParams;

  let dates: string[];
  let date: string | undefined;
  let data!: MatchData;
  let admissionsStaff: (typeof staff.$inferSelect)[];
  let matchByProspective: Map<string, typeof matches.$inferSelect>;
  let openSlotsByProspective: Awaited<ReturnType<typeof getOpenInterviewSlotsByProspective>>;
  try {
    dates = await getShadowDates();
    date = dateParam ?? dates[0];

    if (date) {
      data = await getMatchDataForDate(date);

      admissionsStaff = await db
        .select()
        .from(staff)
        .where(eq(staff.kind, "admissions"))
        .orderBy(asc(staff.fullName));

      const pIds = data.prospectives.map((p) => p.id);
      const existing = pIds.length
        ? await db.select().from(matches).where(inArray(matches.prospectiveId, pIds))
        : [];
      matchByProspective = new Map(existing.map((m) => [m.prospectiveId, m]));

      openSlotsByProspective = await getOpenInterviewSlotsByProspective(
        date,
        data.prospectives.map((p) => p.id),
      );
    }
  } catch (err) {
    console.error("MatchPage: failed to load data", err);
    return <PageLoadError />;
  }

  if (!date) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Run matching</h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          No prospective students with a shadow date yet. Upload a FinalSite bulk
          report on the{" "}
          <Link href="/admin/prospectives/upload" prefetch={false} className="underline">
            Upload
          </Link>{" "}
          tab under Prospectives.
        </p>
      </main>
    );
  }

  const hostName = new Map(data!.hosts.map((h) => [h.id, h.fullName]));
  const timeBlockLabel = new Map(INTERVIEW_TIME_BLOCKS.map((b) => [b.start, b.label]));

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Run matching</h1>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-zinc-500">Shadow date:</span>
          {dates.map((d) => (
            <Link
              key={d}
              href={`/admin/match?date=${d}`}
              prefetch={false}
              className={
                d === date
                  ? "rounded bg-forest px-2 py-1 text-white dark:bg-forest dark:text-white"
                  : "rounded px-2 py-1 underline-offset-2 hover:underline"
              }
            >
              {d}
            </Link>
          ))}
        </div>
      </div>

      <p className="mt-3 text-sm text-zinc-500">
        Host schedules shown here are a snapshot.{" "}
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
            A host&rsquo;s score adds points for every one of those interests they cover: more
            points for a higher-ranked interest, plus a bonus if the prospective would actually sit
            in that class during the visit (rather than the host just happening to share the
            interest too). Points are then subtracted for each free period the host has during the
            visit, and again if the host is already at or over their soft visit cap. Pick a host
            below to see exactly how its score breaks down.
          </p>
        </div>
      </details>

      <div className="mt-3 flex items-center gap-4 text-sm text-zinc-600 dark:text-zinc-400">
        <span>{data.prospectives.length} prospective(s)</span>
        <span>{data.hosts.length} host(s) scheduled this date</span>
        <span>soft cap {data.softCap}</span>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href={`/admin/match/export?date=${date}`}
            prefetch={false}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            Export CSV
          </Link>
          <form action={bulkConfirmBest}>
            <input type="hidden" name="date" value={date} />
            <button className="rounded-md bg-forest px-3 py-1.5 text-sm font-medium text-white dark:bg-forest dark:text-white">
              Confirm best for all
            </button>
          </form>
          <EmailSchedulesButton date={date} />
        </div>
      </div>

      <div className="mt-6 space-y-5">
        {data.prospectives.map((p) => {
          const ranking = data.rankings.find((r) => r.prospectiveId === p.id);
          const best = ranking?.best ?? null;
          const confirmed = matchByProspective.get(p.id);

          return (
            <div
              key={p.id}
              className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800"
            >
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
                  <input type="hidden" name="shadowDate" value={date} />

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
                        const slots = (openSlotsByProspective.get(p.id) ?? []).filter(
                          (slot) => slot.staffId === s.id,
                        );
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
    </main>
  );
}
