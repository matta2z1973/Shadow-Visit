import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { importBatches } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import HostUploadForm from "./host-upload-form";
import ProspectiveUploadForm from "./prospective-upload-form";
import ProspectiveReportUploadForm from "./prospective-report-upload-form";

export const dynamic = "force-dynamic";

const card =
  "rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950";

export default async function UploadsPage() {
  await requireAdmin();
  const recent = await db
    .select()
    .from(importBatches)
    .orderBy(desc(importBatches.createdAt))
    .limit(10);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Uploads</h1>

      <section className={`${card} mt-6`}>
        <h2 className="text-lg font-semibold">Host schedules (Blackbaud)</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Upload one &ldquo;Student Schedule for the Day&rdquo; CSV per host —
          select several at once. Re-uploading a host+date replaces it.
        </p>
        <HostUploadForm />
      </section>

      <section className={`${card} mt-6`}>
        <h2 className="text-lg font-semibold">Prospective students (FinalSite)</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Upload one or more &ldquo;Interview and Visit Form&rdquo; PDFs. We read
          grade, gender, ranked interests, academic interest, shadow date, and the
          family-selected interview slot. Assign the admissions counselor during
          matching.
        </p>
        <ProspectiveUploadForm />
      </section>

      <section className={`${card} mt-6`}>
        <h2 className="text-lg font-semibold">Prospective students (bulk report)</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Upload a FinalSite bulk report (.xlsx) — one row per applicant, covering
          many students at once. Reads name, grade, current school, visit date,
          and up to two ranked interests. This report has no gender column, so
          gender is left blank for admin fill-in; add it on the prospective's
          record before matching runs (gender is a hard filter).
        </p>
        <ProspectiveReportUploadForm />
      </section>

      <section className={`${card} mt-6 opacity-70`}>
        <h2 className="text-lg font-semibold">Course catalog</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Phase 2 — builds the vector store for interest→course matching.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Recent uploads</h2>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Nothing uploaded yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
            {recent.map((b) => (
              <li key={b.id} className="flex items-center justify-between px-4 py-2.5">
                <span>
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium dark:bg-zinc-800">
                    {b.kind}
                  </span>{" "}
                  {b.fileName}
                </span>
                <span className="text-xs text-zinc-500">
                  {b.createdAt?.toLocaleString?.() ?? ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
