import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { staff, facultyInterests, interests } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { categoryLabel, INTEREST_CATEGORIES } from "@/lib/interest-categories";
import { addStaff, deleteStaff, setFacultyInterests, setStaffFeed } from "./actions";

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

export default async function StaffAdmin({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAdmin();
  const { tab } = await searchParams;
  const active = tab === "admissions" ? "admissions" : "faculty";

  const [allStaff, allInterests, mappings] = await Promise.all([
    db.select().from(staff).orderBy(asc(staff.fullName)),
    db
      .select()
      .from(interests)
      .where(eq(interests.active, true))
      .orderBy(asc(interests.category), asc(interests.name)),
    db.select().from(facultyInterests),
  ]);

  const mapFor = (staffId: string) =>
    new Set(mappings.filter((m) => m.staffId === staffId).map((m) => m.interestId));
  const list = allStaff.filter((s) => s.kind === active);

  const tabCls = (t: string) =>
    t === active
      ? "rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      : "rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700";

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>

      <div className="mt-4 flex gap-2">
        <Link href="/admin/staff?tab=faculty" className={tabCls("faculty")}>
          Faculty
        </Link>
        <Link href="/admin/staff?tab=admissions" className={tabCls("admissions")}>
          Admissions
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
        <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
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
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
