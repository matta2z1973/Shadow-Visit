import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  hostStudents,
  hostStudentInterests,
  hostScheduleDays,
  matches,
  appSettings,
  interests,
} from "@/lib/db/schema";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { INTEREST_CATEGORIES } from "@/lib/interest-categories";
import HostsTabs from "@/components/hosts-tabs";
import PageLoadError from "@/components/page-load-error";
import { updateHost, setHostInterests, deleteHost, setHostFeed } from "./actions";
import { newRequestId, timed } from "@/lib/debug-timing";

export const dynamic = "force-dynamic";

function FeedForm({ id, url }: { id: string; url: string | null }) {
  return (
    <form action={setHostFeed} className="mt-2 flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input
        name="icsUrl"
        type="url"
        defaultValue={url ?? ""}
        placeholder="Calendar .ics link (Outlook: Publish a calendar → titles and locations)"
        className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
      />
      <button type="submit" className="text-xs text-zinc-500 underline-offset-2 hover:underline">
        save link
      </button>
      {url ? <span className="text-xs text-green-600">●</span> : null}
    </form>
  );
}

async function getSoftCap(): Promise<number> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, "host_soft_cap"))
    .limit(1);
  const n = row ? parseInt(row.value, 10) : 5;
  return Number.isFinite(n) ? n : 5;
}

const field =
  "rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export default async function HostsPage() {
  await requireAdmin();

  type HostsPageData = {
    softCap: number;
    hosts: (typeof hostStudents.$inferSelect)[];
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
        db.select().from(hostStudents).orderBy(asc(hostStudents.fullName)),
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

  const interestsFor = (hostId: string) =>
    new Set(hostInterestRows.filter((r) => r.hostStudentId === hostId).map((r) => r.interestId));

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
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

      <div className="mt-6 space-y-3">
        {hosts.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No hosts yet. Upload host schedules or have students log in.
          </p>
        ) : (
          hosts.map((h) => {
            const used = countMap.get(h.id) ?? 0;
            const over = used >= softCap;
            const selected = interestsFor(h.id);
            return (
              <div key={h.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                <form action={updateHost} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="id" value={h.id} />
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-zinc-500">First name</span>
                    <input name="firstName" defaultValue={h.firstName ?? ""} className={`${field} w-32`} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-zinc-500">Last name</span>
                    <input name="lastName" defaultValue={h.lastName ?? ""} className={`${field} w-32`} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-zinc-500">Grade</span>
                    <input name="grade" type="number" min={1} max={12} defaultValue={h.grade ?? ""} className={`${field} w-16`} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-zinc-500">Gender</span>
                    <select name="gender" defaultValue={h.gender ?? ""} className={field}>
                      <option value="">—</option>
                      <option value="M">M</option>
                      <option value="F">F</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 pb-1.5 text-xs">
                    <input type="checkbox" name="active" defaultChecked={h.active} className="h-4 w-4" />
                    <span>Active</span>
                  </label>
                  <button type="submit" className="rounded-md bg-forest px-3 py-1.5 text-sm font-medium text-white dark:bg-forest dark:text-white">
                    Save
                  </button>
                  <span className="pb-1.5 text-xs">
                    Visits: {used}/{softCap}{" "}
                    {over ? (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                        at/over cap
                      </span>
                    ) : null}
                    {!hasSchedule(h.id, h.icsUrl) ? (
                      <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                        no calendar link
                      </span>
                    ) : null}
                  </span>
                </form>

                <FeedForm id={h.id} url={h.icsUrl} />

                <details className="mt-3 rounded-md border border-zinc-200 dark:border-zinc-800">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                    Interests ({selected.size})
                  </summary>
                  <form action={setHostInterests} className="px-3 pb-3">
                    <input type="hidden" name="id" value={h.id} />
                    {INTEREST_CATEGORIES.map((c) => {
                      const items = allInterests.filter((i) => i.category === c.slug);
                      if (!items.length) return null;
                      return (
                        <fieldset key={c.slug} className="mt-2">
                          <legend className="text-xs font-semibold text-zinc-500">{c.label}</legend>
                          <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-3">
                            {items.map((i) => (
                              <label key={i.id} className="flex items-center gap-1.5 text-sm">
                                <input type="checkbox" name="interestIds" value={i.id} defaultChecked={selected.has(i.id)} className="h-4 w-4" />
                                <span>{i.name}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      );
                    })}
                    <button type="submit" className="mt-3 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">
                      Save interests
                    </button>
                  </form>
                </details>

                <form action={deleteHost} className="mt-2">
                  <input type="hidden" name="id" value={h.id} />
                  <button type="submit" className="text-xs text-red-600 hover:underline">
                    delete host
                  </button>
                </form>
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
