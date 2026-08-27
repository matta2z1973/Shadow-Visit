import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { importBatches } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import ProspectivesTabs from "@/components/prospectives-tabs";
import ProspectiveReportUploadForm from "../../uploads/prospective-report-upload-form";

export const dynamic = "force-dynamic";

const card =
  "rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950";

export default async function ProspectivesUploadPage() {
  await requireAdmin();
  const recent = await db
    .select()
    .from(importBatches)
    .orderBy(desc(importBatches.createdAt))
    .limit(10);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Prospective students</h1>

      <ProspectivesTabs active="upload" />

      <section className={`${card} mt-6`}>
        <h2 className="text-lg font-semibold">Prospective students (FinalSite)</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Upload a FinalSite bulk report (.xlsx) — one row per applicant, covering
          many students at once. Reads name, gender, grade, current school, visit
          date, and up to two ranked interests (the paired &ldquo;Involvement&rdquo;
          columns are proficiency levels and aren&rsquo;t used). Any row missing
          gender is flagged after upload — fill it in on the prospective&rsquo;s
          record before matching runs (gender is a hard filter).
        </p>
        <ProspectiveReportUploadForm />
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
