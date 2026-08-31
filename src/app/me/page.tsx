import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hostStudentInterests, interests } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { INTEREST_CATEGORIES } from "@/lib/interest-categories";
import { getOrCreateHost } from "@/lib/hosts";
import InterestsForm from "./interests-form";
import ScheduleLinkForm from "./schedule-link-form";
import PageLoadError from "@/components/page-load-error";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const user = await requireUser();

  let host: Awaited<ReturnType<typeof getOrCreateHost>>;
  let allInterests: (typeof interests.$inferSelect)[];
  let selectedIds: string[];
  try {
    host = await getOrCreateHost(user);

    allInterests = await db
      .select()
      .from(interests)
      .where(eq(interests.active, true))
      .orderBy(asc(interests.category), asc(interests.sortOrder), asc(interests.name));

    const selected = await db
      .select({ interestId: hostStudentInterests.interestId })
      .from(hostStudentInterests)
      .where(eq(hostStudentInterests.hostStudentId, host.id));
    selectedIds = selected.map((s) => s.interestId);
  } catch (err) {
    console.error("MePage: failed to load data", err);
    return <PageLoadError />;
  }

  const groups = INTEREST_CATEGORIES.map((c) => ({
    label: c.label,
    items: allInterests
      .filter((i) => i.category === c.slug)
      .map((i) => ({ id: i.id, name: i.name })),
  })).filter((g) => g.items.length > 0);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">My interests</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Tell us a bit about yourself so we can match you with the right shadow
        visitors.
      </p>

      <div className="mt-6 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">My schedule</h2>
          <a
            href="https://claude.ai/code/artifact/27730909-9dd0-4697-898b-79fb011c746c"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            <span aria-hidden>❓</span> Help me find this
          </a>
        </div>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Paste your Outlook calendar&rsquo;s subscribe link (the one ending in{" "}
          <code>.ics</code>, from Outlook&rsquo;s Calendar settings →
          &ldquo;Publish a calendar&rdquo;) so we always know when you&rsquo;re
          free to host — one time, no need to re-upload anything later.
        </p>
        <ScheduleLinkForm currentUrl={host.icsUrl} />
      </div>

      <div className="mt-10 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <InterestsForm
          host={{ grade: host.grade, gender: host.gender }}
          groups={groups}
          selectedIds={selectedIds}
        />
      </div>
    </main>
  );
}
