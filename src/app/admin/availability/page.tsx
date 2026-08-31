import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { staff } from "@/lib/db/schema";
import { asc, isNotNull } from "drizzle-orm";
import { US_PERIOD_WINDOWS } from "@/lib/schedule/us-blocks";
import {
  fetchBusyIntervals,
  blocksFreeBusy,
  type BlockFreeBusy,
} from "@/lib/ics-parse";
import PageLoadError from "@/components/page-load-error";

export const dynamic = "force-dynamic";

type Row =
  | { staffName: string; kind: string; error: string; blocks?: undefined }
  | { staffName: string; kind: string; error: null; blocks: BlockFreeBusy[] };

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireAdmin();
  const { date: dateParam } = await searchParams;
  // Default to a neutral upcoming weekday if none given.
  const date = dateParam ?? "2026-09-16";

  let withFeeds: (typeof staff.$inferSelect)[];
  try {
    withFeeds = await db
      .select()
      .from(staff)
      .where(isNotNull(staff.calendarFeedUrl))
      .orderBy(asc(staff.kind), asc(staff.fullName));
  } catch (err) {
    console.error("AvailabilityPage: failed to load data", err);
    return <PageLoadError />;
  }

  const rows: Row[] = await Promise.all(
    withFeeds.map(async (s): Promise<Row> => {
      try {
        const busy = await fetchBusyIntervals(s.calendarFeedUrl!);
        return {
          staffName: s.fullName,
          kind: s.kind,
          error: null,
          blocks: blocksFreeBusy(busy, date, US_PERIOD_WINDOWS),
        };
      } catch (e) {
        return {
          staffName: s.fullName,
          kind: s.kind,
          error: e instanceof Error ? e.message : "fetch failed",
        };
      }
    }),
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Staff availability</h1>
        <form className="flex items-center gap-2 text-sm">
          <label htmlFor="date" className="text-zinc-500">
            Date
          </label>
          <input
            id="date"
            name="date"
            type="date"
            defaultValue={date}
            className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button className="rounded-md border border-zinc-300 px-3 py-1 dark:border-zinc-700">
            Load
          </button>
        </form>
      </div>

      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Live free/busy from each staffer&rsquo;s published calendar link. Published
        feeds refresh on a delay (often a few hours), so treat this as near-real-time.
        Add links on the{" "}
        <a href="/admin/staff" className="underline">
          Staff
        </a>{" "}
        page.
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500">
          No staff have a calendar link yet.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left dark:border-zinc-800">
                <th className="py-2 pr-4 font-medium">Staff</th>
                {US_PERIOD_WINDOWS.map((w) => (
                  <th key={w.label} className="px-2 py-2 text-center font-medium">
                    {w.label}
                    <div className="text-[10px] font-normal text-zinc-400">
                      {w.startTime.slice(0, 5)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={idx} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-2 pr-4">
                    {r.staffName}
                    <span className="ml-2 text-xs text-zinc-400">{r.kind}</span>
                  </td>
                  {!r.blocks ? (
                    <td colSpan={US_PERIOD_WINDOWS.length} className="py-2 text-xs text-red-600">
                      {r.error}
                    </td>
                  ) : (
                    r.blocks.map((b) => (
                      <td key={b.label} className="px-2 py-2 text-center">
                        {b.free ? (
                          <span className="inline-block rounded bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900 dark:text-green-200">
                            free
                          </span>
                        ) : (
                          <span
                            title={b.conflict ?? "Busy"}
                            className="inline-block rounded bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-900 dark:text-red-200"
                          >
                            busy
                          </span>
                        )}
                      </td>
                    ))
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
