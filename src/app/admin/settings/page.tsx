import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { courses } from "@/lib/db/schema";
import { desc, sql } from "drizzle-orm";
import { getLlmSettingsMasked } from "@/lib/llm/settings";
import SettingsTabs from "@/components/settings-tabs";
import PageLoadError from "@/components/page-load-error";
import LlmSettingsForm from "./llm-settings-form";
import CourseCatalogForm from "./course-catalog-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdmin();

  let settings: Awaited<ReturnType<typeof getLlmSettingsMasked>>;
  let countRow: { count: number } | undefined;
  let latest: { updatedAt: Date | null } | undefined;
  try {
    [settings, [countRow], [latest]] = await Promise.all([
      getLlmSettingsMasked(),
      db.select({ count: sql<number>`count(*)::int` }).from(courses),
      db.select({ updatedAt: courses.updatedAt }).from(courses).orderBy(desc(courses.updatedAt)).limit(1),
    ]);
  } catch (err) {
    console.error("SettingsPage: failed to load data", err);
    return <PageLoadError />;
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">AI settings</h1>

      <SettingsTabs active="ai" />

      <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        Configure the LLM provider used for matching, and upload the course catalog that powers
        semantic interest-to-class matching.
      </p>

      <section className="mt-8 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-lg font-medium">LLM provider</h2>
        <LlmSettingsForm settings={settings} />
      </section>

      <section className="mt-6 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-lg font-medium">Course catalog</h2>
        <CourseCatalogForm
          currentCount={countRow?.count ?? 0}
          lastUpdated={latest?.updatedAt ? new Date(latest.updatedAt).toLocaleString() : null}
        />
      </section>
    </main>
  );
}
