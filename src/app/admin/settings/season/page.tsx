import { requireAdmin } from "@/lib/auth";
import { getShadowSeason } from "@/lib/schedule/season";
import SettingsTabs from "@/components/settings-tabs";
import PageLoadError from "@/components/page-load-error";
import SeasonForm from "./season-form";

export const dynamic = "force-dynamic";

export default async function SeasonSettingsPage() {
  await requireAdmin();

  let season: Awaited<ReturnType<typeof getShadowSeason>>;
  try {
    season = await getShadowSeason();
  } catch (err) {
    console.error("SeasonSettingsPage: failed to load data", err);
    return <PageLoadError />;
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Shadow visit season</h1>

      <SettingsTabs active="season" />

      <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        The date range host calendars get synced across when you click &ldquo;Refresh
        schedules&rdquo; (Hosts → Schedules), and the range test-host schedules apply to. Pulling a
        host&rsquo;s whole calendar feed happens in one request regardless of how many days are in
        this range — a season is however long actually makes sense (typically a semester or two),
        not a technical limit.
      </p>

      <section className="mt-6 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-lg font-medium">Current season</h2>
        {season ? (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {season.start} to {season.end}
          </p>
        ) : (
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
            No season set yet — schedule refresh and test-host schedules won&rsquo;t have a range
            to apply to until one is saved below.
          </p>
        )}
        <SeasonForm currentStart={season?.start ?? null} currentEnd={season?.end ?? null} />
      </section>
    </main>
  );
}
