import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { staff, facultyInterests, interests, interviewerAvailability } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { categoryLabel, INTEREST_CATEGORIES } from "@/lib/interest-categories";
import { INTERVIEW_WEEKDAYS, INTERVIEW_TIME_BLOCKS } from "@/lib/schedule/interview-blocks";
import SettingsTabs from "@/components/settings-tabs";
import PageLoadError from "@/components/page-load-error";
import {
  addStaff,
  deleteStaff,
  setFacultyInterests,
  setStaffFeed,
  addInterviewerAvailability,
  deleteInterviewerAvailability,
} from "./actions";

export const dynamic = "force-dynamic";

function FeedForm({ id, url }: { id: string; url: string | null }) {
  return (
    <form action={setStaffFeed} className="mt-2 flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input
        name="calendarFeedUrl"
        type="url"
        defaultValue={url ?? ""}
        placeholder="Shared calendar .ics link (published free/busy)"
        className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
      />
      <button type="submit" className="text-xs text-zinc-500 underline-offset-2 hover:underline">
        save link
      </button>
      {url ? <span className="text-xs text-green-600">●</span> : null}
    </form>
  );
}

function weekdayLabel(days: number[]): string {
  const labels = new Map<number, string>(INTERVIEW_WEEKDAYS.map((d) => [d.value, d.label]));
  return days
    .slice()
    .sort()
    .map((d) => labels.get(d) ?? "?")
    .join(", ");
}

function AvailabilitySection({
  staffId,
  rows,
}: {
  staffId: string;
  rows: (typeof interviewerAvailability.$inferSelect)[];
}) {
  return (
    <details className="mt-3 rounded-md border border-zinc-200 dark:border-zinc-800">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
        Interview availability ({rows.length})
      </summary>
      <div className="space-y-2 px-3 pb-3">
        {rows.map((r) => (
          <div
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-zinc-50 px-3 py-2 text-xs dark:bg-zinc-900"
          >
            <div>
              <span className="font-medium">
                {r.startDate} – {r.endDate}
              </span>
              <span className="ml-2 text-zinc-500">{weekdayLabel(r.weekdays)}</span>
              <span className="ml-2 text-zinc-500">{r.timeBlocks.length} slots/day</span>
            </div>
            <form action={deleteInterviewerAvailability}>
              <input type="hidden" name="id" value={r.id} />
              <button type="submit" className="text-red-600 hover:underline">
                remove
              </button>
            </form>
          </div>
        ))}

        <form action={addInterviewerAvailability} className="mt-2 space-y-2 rounded-md border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
          <input type="hidden" name="staffId" value={staffId} />
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-zinc-500">Start date</span>
              <input
                name="startDate"
                type="date"
                required
                className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-zinc-500">End date</span>
              <input
                name="endDate"
                type="date"
                required
                className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          </div>

          <fieldset>
            <legend className="text-xs font-semibold text-zinc-500">Days of week</legend>
            <div className="mt-1 flex flex-wrap gap-3">
              {INTERVIEW_WEEKDAYS.map((d) => (
                <label key={d.value} className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" name="weekdays" value={d.value} defaultChecked className="h-3.5 w-3.5" />
                  <span>{d.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-xs font-semibold text-zinc-500">
              Interview time blocks (30 min, 8am–3pm)
            </legend>
            <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-4">
              {INTERVIEW_TIME_BLOCKS.map((b) => (
                <label key={b.start} className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" name="timeBlocks" value={b.start} className="h-3.5 w-3.5" />
                  <span>{b.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <button type="submit" className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-700">
            Add availability
          </button>
        </form>
      </div>
    </details>
  );
}

export default async function StaffAdmin({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAdmin();
  const { tab } = await searchParams;
  const active = tab === "faculty" ? "faculty" : "admissions";

  let allStaff: (typeof staff.$inferSelect)[];
  let allInterests: (typeof interests.$inferSelect)[];
  let mappings: (typeof facultyInterests.$inferSelect)[];
  let availabilityRows: (typeof interviewerAvailability.$inferSelect)[];
  try {
    [allStaff, allInterests, mappings, availabilityRows] = await Promise.all([
      db.select().from(staff).orderBy(asc(staff.fullName)),
      db
        .select()
        .from(interests)
        .where(eq(interests.active, true))
        .orderBy(asc(interests.category), asc(interests.name)),
      db.select().from(facultyInterests),
      db.select().from(interviewerAvailability).orderBy(asc(interviewerAvailability.startDate)),
    ]);
  } catch (err) {
    console.error("StaffAdmin: failed to load data", err);
    return <PageLoadError />;
  }

  const mapFor = (staffId: string) =>
    new Set(mappings.filter((m) => m.staffId === staffId).map((m) => m.interestId));
  const availabilityFor = (staffId: string) =>
    availabilityRows.filter((r) => r.staffId === staffId);
  const list = allStaff.filter((s) => s.kind === active);

  const tabCls = (t: string) =>
    t === active
      ? "rounded-md bg-forest px-3 py-1.5 text-sm font-medium text-white dark:bg-forest dark:text-white"
      : "rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700";

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>

      <SettingsTabs active="staff" />

      <div className="mt-4 flex gap-2">
        <Link href="/admin/staff?tab=admissions" prefetch={false} className={tabCls("admissions")}>
          Admissions
        </Link>
        <Link href="/admin/staff?tab=faculty" prefetch={false} className={tabCls("faculty")}>
          Faculty
        </Link>
      </div>

      <form action={addStaff} className="mt-6 flex flex-wrap items-end gap-2">
        <input type="hidden" name="kind" value={active} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">First name</span>
          <input name="firstName" required className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Last name</span>
          <input name="lastName" className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Email</span>
          <input name="email" type="email" className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" />
        </label>
        <button type="submit" className="rounded-md bg-forest px-4 py-2 text-sm font-medium text-white dark:bg-forest dark:text-white">
          Add {active === "faculty" ? "faculty" : "admissions"}
        </button>
      </form>

      <div className="mt-8 space-y-4">
        {list.length === 0 ? (
          <p className="text-sm text-zinc-500">No {active} yet.</p>
        ) : (
          list.map((s) => {
            const selected = mapFor(s.id);
            return (
              <div key={s.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <div className="font-medium">
                    {s.fullName}
                    {s.email ? <span className="ml-2 text-xs text-zinc-500">{s.email}</span> : null}
                  </div>
                  <form action={deleteStaff}>
                    <input type="hidden" name="id" value={s.id} />
                    <button type="submit" className="text-xs text-red-600 hover:underline">
                      remove
                    </button>
                  </form>
                </div>

                {active === "faculty" ? (
                  <details className="mt-3 rounded-md border border-zinc-200 dark:border-zinc-800">
                    <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                      Interests this faculty can cover ({selected.size})
                    </summary>
                    <form action={setFacultyInterests} className="px-3 pb-3">
                      <input type="hidden" name="staffId" value={s.id} />
                      {INTEREST_CATEGORIES.map((c) => {
                        const items = allInterests.filter((i) => i.category === c.slug);
                        if (!items.length) return null;
                        return (
                          <fieldset key={c.slug} className="mt-2">
                            <legend className="text-xs font-semibold text-zinc-500">
                              {categoryLabel(c.slug)}
                            </legend>
                            <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-3">
                              {items.map((i) => (
                                <label key={i.id} className="flex items-center gap-1.5 text-sm">
                                  <input
                                    type="checkbox"
                                    name="interestIds"
                                    value={i.id}
                                    defaultChecked={selected.has(i.id)}
                                    className="h-4 w-4"
                                  />
                                  <span>{i.name}</span>
                                </label>
                              ))}
                            </div>
                          </fieldset>
                        );
                      })}
                      <button type="submit" className="mt-3 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">
                        Save mapping
                      </button>
                    </form>
                  </details>
                ) : null}

                <FeedForm id={s.id} url={s.calendarFeedUrl} />

                {active === "admissions" ? (
                  <AvailabilitySection staffId={s.id} rows={availabilityFor(s.id)} />
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
