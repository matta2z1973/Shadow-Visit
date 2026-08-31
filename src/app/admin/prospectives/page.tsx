import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  prospectiveStudents,
  prospectiveInterests,
  interests,
  staff,
} from "@/lib/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import ProspectivesTabs from "@/components/prospectives-tabs";
import PageLoadError from "@/components/page-load-error";
import { updateProspective, deleteProspective } from "./actions";

export const dynamic = "force-dynamic";

const field =
  "rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export default async function ProspectivesPage() {
  await requireAdmin();

  let rows: (typeof prospectiveStudents.$inferSelect)[];
  let pInterests: (typeof prospectiveInterests.$inferSelect)[];
  let allInterests: (typeof interests.$inferSelect)[];
  let admissions: (typeof staff.$inferSelect)[];
  try {
    rows = await db
      .select()
      .from(prospectiveStudents)
      .orderBy(asc(prospectiveStudents.shadowDate), asc(prospectiveStudents.fullName));

    const ids = rows.map((r) => r.id);
    [pInterests, allInterests, admissions] = await Promise.all([
      ids.length
        ? db.select().from(prospectiveInterests).where(inArray(prospectiveInterests.prospectiveId, ids))
        : Promise.resolve([]),
      db.select().from(interests),
      db.select().from(staff).where(eq(staff.kind, "admissions")).orderBy(asc(staff.fullName)),
    ]);
  } catch (err) {
    console.error("ProspectivesPage: failed to load data", err);
    return <PageLoadError />;
  }
  const interestName = new Map(allInterests.map((i) => [i.id, i.name]));
  const interestsFor = (pid: string) =>
    pInterests
      .filter((pi) => pi.prospectiveId === pid)
      .sort((a, b) => a.priority - b.priority)
      .map((pi) => ({
        priority: pi.priority,
        name: interestName.get(pi.interestId) ?? "?",
      }));

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Prospective students</h1>
        <span className="text-sm text-zinc-500">{rows.length} total</span>
      </div>

      <ProspectivesTabs active="students" />

      <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        Imported from FinalSite forms. All fields are editable; interests come from
        the form. Assign the admissions interviewer here or during matching.
      </p>

      <div className="mt-6 space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">
            None yet — upload Interview &amp; Visit Form PDFs on the Uploads tab.
          </p>
        ) : (
          rows.map((p) => (
            <div key={p.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <form action={updateProspective} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="id" value={p.id} />
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-zinc-500">First name</span>
                  <input name="firstName" defaultValue={p.firstName ?? ""} className={`${field} w-28`} />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-zinc-500">Last name</span>
                  <input name="lastName" defaultValue={p.lastName ?? ""} className={`${field} w-28`} />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-zinc-500">Grade</span>
                  <input name="grade" type="number" min={1} max={12} defaultValue={p.grade ?? ""} className={`${field} w-16`} />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-zinc-500">Gender</span>
                  <select name="gender" defaultValue={p.gender ?? ""} className={field}>
                    <option value="">—</option>
                    <option value="M">M</option>
                    <option value="F">F</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-zinc-500">Current school</span>
                  <input name="currentSchool" defaultValue={p.currentSchool ?? ""} className={`${field} w-44`} />
                </label>
                <label className="flex items-center gap-1.5 pb-1.5 text-xs">
                  <input type="checkbox" name="wantsShadow" defaultChecked={p.wantsShadow} className="h-4 w-4" />
                  <span>Shadow</span>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-zinc-500">Shadow date</span>
                  <input name="shadowDate" type="date" defaultValue={p.shadowDate ?? ""} className={field} />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-zinc-500">Interview date</span>
                  <input name="interviewDate" type="date" defaultValue={p.interviewDate ?? ""} className={field} />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-zinc-500">Start</span>
                  <input name="interviewStart" type="time" defaultValue={p.interviewStart?.slice(0, 5) ?? ""} className={field} />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-zinc-500">End</span>
                  <input name="interviewEnd" type="time" defaultValue={p.interviewEnd?.slice(0, 5) ?? ""} className={field} />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-zinc-500">Family email</span>
                  <input name="familyEmail" type="email" defaultValue={p.familyEmail ?? ""} className={`${field} w-48`} />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-zinc-500">Interviewer</span>
                  <select name="interviewerStaffId" defaultValue={p.interviewerStaffId ?? ""} className={field}>
                    <option value="">—</option>
                    {admissions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="rounded-md bg-forest px-3 py-1.5 text-sm font-medium text-white dark:bg-forest dark:text-white">
                  Save
                </button>
              </form>

              <div className="mt-3 flex flex-wrap items-center gap-1">
                {interestsFor(p.id).map((i) => (
                  <span key={i.priority} className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {i.priority === 0 ? "Academic: " : `#${i.priority} `}
                    {i.name}
                  </span>
                ))}
                <form action={deleteProspective} className="ml-auto">
                  <input type="hidden" name="id" value={p.id} />
                  <button type="submit" className="text-xs text-red-600 hover:underline">
                    delete
                  </button>
                </form>
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
