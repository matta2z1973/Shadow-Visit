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
import { confirmMatch, bulkConfirmBest } from "./actions";
import EmailSchedulesButton from "./email-schedules-button";

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

  const dates = await getShadowDates();
  const date = dateParam ?? dates[0];

  if (!date) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Run matching</h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          No prospective students with a shadow date yet. Upload Interview &amp;
          Visit Form PDFs on the{" "}
          <Link href="/admin/uploads" className="underline">
            Uploads
          </Link>{" "}
          page.
        </p>
      </main>
    );
  }

  const data: MatchData = await getMatchDataForDate(date);

  const admissionsStaff = await db
    .select()
    .from(staff)
    .where(eq(staff.kind, "admissions"))
    .orderBy(asc(staff.fullName));

  const pIds = data.prospectives.map((p) => p.id);
  const existing = pIds.length
    ? await db.select().from(matches).where(inArray(matches.prospectiveId, pIds))
    : [];
  const matchByProspective = new Map(existing.map((m) => [m.prospectiveId, m]));

  const hostName = new Map(data.hosts.map((h) => [h.id, h.fullName]));

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
              className={
                d === date
                  ? "rounded bg-zinc-900 px-2 py-1 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "rounded px-2 py-1 underline-offset-2 hover:underline"
              }
            >
              {d}
            </Link>
          ))}
        </div>
      </div>

      {data.scheduleErrors.length ? (
        <div className="mt-3 rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900 dark:text-amber-200">
          Couldn&rsquo;t load {data.scheduleErrors.length} host calendar feed
          {data.scheduleErrors.length === 1 ? "" : "s"} — they were left out
          of matching for this date:{" "}
          {data.scheduleErrors.map((e) => e.hostName).join(", ")}
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-4 text-sm text-zinc-600 dark:text-zinc-400">
        <span>{data.prospectives.length} prospective(s)</span>
        <span>{data.hosts.length} host(s) scheduled this date</span>
        <span>soft cap {data.softCap}</span>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href={`/admin/match/export?date=${date}`}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            Export CSV
          </Link>
          <form action={bulkConfirmBest}>
            <input type="hidden" name="date" value={date} />
            <button className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
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
                    {i.priority === 0 ? "Academic: " : `#${i.priority} `}
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

                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium">Host</span>
                    <select
                      name="hostStudentId"
                      defaultValue={confirmed?.hostStudentId ?? best?.hostStudentId ?? ""}
                      className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      {ranking?.ranked.map((h) => (
                        <option key={h.hostStudentId} value={h.hostStudentId}>
                          {h.fullName} · score {h.score} · {h.coveredCount}/
                          {p.interests.length} interests · {h.freePeriodCount} free
                          {h.overCap ? " · OVER CAP" : ""}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium">Counselor</span>
                    <select
                      name="counselorStaffId"
                      className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      <option value="">—</option>
                      {admissionsStaff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.fullName}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
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
