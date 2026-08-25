import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getMatchDetail } from "@/lib/matching/match-detail";
import { fmtTime } from "@/lib/schedule/day-timeline";
import PrintButton from "@/components/print-button";

export const dynamic = "force-dynamic";

function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const rowTone: Record<string, string> = {
  interview: "border-l-4 border-l-blue-500",
  faculty: "border-l-4 border-l-purple-500",
  class: "border-l-4 border-l-zinc-300 dark:border-l-zinc-700",
  other: "border-l-4 border-l-transparent",
};

export default async function SchedulePrint({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  await requireAdmin();
  const { matchId } = await params;
  const detail = await getMatchDetail(matchId);
  if (!detail) notFound();

  const { prospective, host, counselorName, match, timeline } = detail;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10 print:py-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Shadow Visit Schedule
          </h1>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            {longDate(match.shadowDate)}
            {match.dayType ? ` · ${match.dayType} day` : ""}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Link
            href={`/admin/schedule/${matchId}/ics`}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            Download .ics
          </Link>
          <PrintButton />
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div>
          <dt className="text-zinc-500">Visiting student</dt>
          <dd className="font-medium">
            {prospective.fullName} (grade {prospective.grade ?? "?"})
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Host</dt>
          <dd className="font-medium">{host?.fullName ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Admissions counselor</dt>
          <dd className="font-medium">{counselorName ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Current school</dt>
          <dd className="font-medium">{prospective.currentSchool ?? "—"}</dd>
        </div>
      </dl>

      <ol className="mt-8 space-y-2">
        {timeline.map((row, idx) => (
          <li
            key={idx}
            className={`flex gap-4 rounded-md bg-zinc-50 px-4 py-3 dark:bg-zinc-900 ${rowTone[row.kind]}`}
          >
            <div className="w-32 shrink-0 text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
              {fmtTime(row.startTime)}–{fmtTime(row.endTime)}
            </div>
            <div>
              <div className="font-medium">{row.title}</div>
              {row.detail ? (
                <div className="text-sm text-zinc-500">{row.detail}</div>
              ) : null}
            </div>
          </li>
        ))}
        {timeline.length === 0 ? (
          <li className="text-sm text-zinc-500">
            No schedule blocks found for the host on this date. Either they
            haven&rsquo;t saved a calendar link at <code>/me</code> yet, their
            calendar has nothing on {match.shadowDate}, or it just hasn&rsquo;t
            been synced for this date yet — try the &ldquo;Refresh
            schedules&rdquo; button on the Schedules tab.
          </li>
        ) : null}
      </ol>

      <p className="mt-8 text-xs text-zinc-400 print:mt-4">
        Greenhill School Admissions · Shadow Visit
      </p>
    </main>
  );
}
