"use client";

import { useState } from "react";
import { priorityWeight } from "@/lib/matching/engine";

export type CoverageDisplay = {
  name: string;
  priority: number;
  covered: boolean;
  via: "host_class" | "host_interest" | null;
  blockLabel: string | null;
};

export type HostOption = {
  hostStudentId: string;
  fullName: string;
  score: number;
  freePeriodCount: number;
  overCap: boolean;
  coveredCount: number;
  totalInterests: number;
  coverage: CoverageDisplay[];
  hasCalendar: boolean;
  usedScheduleMatching: boolean;
};

function priorityLabel(priority: number): string {
  return priority === 0 ? "Academic interest" : `#${priority} interest`;
}

export default function HostPicker({
  options,
  defaultHostId,
}: {
  options: HostOption[];
  defaultHostId: string;
}) {
  const [selectedId, setSelectedId] = useState(defaultHostId || options[0]?.hostStudentId || "");
  const selected = options.find((o) => o.hostStudentId === selectedId) ?? null;

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">Host</span>
      <select
        name="hostStudentId"
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
      >
        {options.map((h) => (
          <option key={h.hostStudentId} value={h.hostStudentId}>
            {h.hasCalendar ? "📅" : "🚫📅"} {h.fullName} · score {h.score} · {h.coveredCount}/
            {h.totalInterests} interests · {h.freePeriodCount} free
            {h.overCap ? " · OVER CAP" : ""}
          </option>
        ))}
      </select>

      {selected ? (
        <details className="mt-1 w-full max-w-sm rounded-md bg-zinc-50 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          <summary className="cursor-pointer px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
            Why score {selected.score}?
          </summary>
          <div className="px-3 pb-2">
            <div
              className={`mb-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${
                selected.hasCalendar
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
              }`}
            >
              {selected.hasCalendar ? "📅 Calendar on file" : "🚫📅 No calendar on file"}
            </div>
            {!selected.usedScheduleMatching ? (
              <p className="mb-1.5 text-zinc-500">
                Middle School matches on interests only — class schedule isn&rsquo;t used for this
                grade yet.
              </p>
            ) : null}
            <ul className="space-y-0.5">
              {selected.coverage.map((c) => (
                <li key={c.name}>
                  {c.covered ? "✓" : "–"} {priorityLabel(c.priority)} ({c.name})
                  {c.covered ? (
                    c.via === "host_class" ? (
                      <span className="text-green-700 dark:text-green-400">
                        {" "}
                        — sits in their {c.blockLabel} class (+{priorityWeight(c.priority) * 2 + 2})
                      </span>
                    ) : (
                      <span className="text-green-700 dark:text-green-400">
                        {" "}
                        — host also lists this interest (+{priorityWeight(c.priority) * 2})
                      </span>
                    )
                  ) : (
                    " — not covered"
                  )}
                </li>
              ))}
              {selected.usedScheduleMatching ? (
                <li>
                  {selected.freePeriodCount} free period{selected.freePeriodCount === 1 ? "" : "s"} during
                  the visit
                  {selected.freePeriodCount > 0 ? (
                    <span className="text-red-700 dark:text-red-400"> (−{selected.freePeriodCount * 3})</span>
                  ) : null}
                </li>
              ) : null}
              {selected.overCap ? (
                <li className="text-red-700 dark:text-red-400">Host at/over visit soft cap (−10)</li>
              ) : null}
            </ul>
          </div>
        </details>
      ) : null}
    </label>
  );
}
