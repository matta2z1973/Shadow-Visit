"use client";

import type { InterestValueView } from "./prospective-report-actions";
import type { InterestOption } from "@/lib/finalsite/prospective-import";
import { IGNORE_INTEREST } from "@/lib/finalsite/interest-matching";

const BADGE: Record<string, { label: string; cls: string }> = {
  chosen: { label: "Your pick", cls: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200" },
  saved: { label: "Remembered", cls: "bg-cool-green/15 text-forest dark:text-mint" },
  exact: { label: "Matched", cls: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  fuzzy: { label: "Guessed — check", cls: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  ignored: { label: "Not imported", cls: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400" },
  none: { label: "No match", cls: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
};

// Rendered inside the upload <form>, next to the column panel: each select is
// named ival:<normalized value>, so "Re-read file" re-runs the preview with
// these picks. Keyed by previewId in the parent, so selects reset to what the
// server echoed back after every read.
export default function InterestValuesPanel({
  values,
  options,
  pending,
  remember,
  onRememberChange,
}: {
  values: InterestValueView[];
  options: InterestOption[];
  pending: boolean;
  remember: boolean;
  onRememberChange: (v: boolean) => void;
}) {
  if (values.length === 0) return null;
  const nameById = new Map(options.map((o) => [o.id, o.name]));
  const unmatched = values.filter((v) => !v.interestId && v.source !== "ignored").length;
  const guessed = values.filter((v) => v.source === "fuzzy").length;
  const anyChosen = values.some((v) => v.chosen !== "");

  const groups = new Map<string, InterestOption[]>();
  for (const o of options) groups.set(o.category, [...(groups.get(o.category) ?? []), o]);

  return (
    <details
      open={unmatched > 0 || guessed > 0 || anyChosen}
      className="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-800"
    >
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
        Interest matching{" "}
        <span className="font-normal text-zinc-500">
          — {values.length} interest{values.length === 1 ? "" : "s"} in the file
          {unmatched ? ` · ${unmatched} not matched` : ""}
          {guessed ? ` · ${guessed} guessed` : ""}
        </span>
      </summary>
      <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <p className="text-xs text-zinc-500">
          Each interest named in the file and the platform interest it&rsquo;ll be saved as.
          &ldquo;Guessed&rdquo; means the names differ (e.g. FinalSite&rsquo;s &ldquo;Soccer
          (boys/girls)&rdquo; vs. the platform&rsquo;s &ldquo;Soccer&rdquo;) — check those. Pick a
          different interest or &ldquo;Don&rsquo;t import&rdquo;, then re-read the file.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="py-1 pr-3 font-medium">In the file</th>
                <th className="py-1 pr-3 font-medium">Students</th>
                <th className="py-1 pr-3 font-medium">Platform interest</th>
                <th className="py-1 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {values.map((v) => {
                const badge = BADGE[v.source ?? "none"];
                const autoName = v.source !== "chosen" && v.interestId ? nameById.get(v.interestId) : null;
                return (
                  <tr key={v.key}>
                    <td className="py-1.5 pr-3">{v.value}</td>
                    <td className="py-1.5 pr-3 text-zinc-500">{v.count}</td>
                    <td className="py-1.5 pr-3">
                      <select
                        name={`ival:${v.key}`}
                        defaultValue={v.chosen}
                        className="w-full min-w-48 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        <option value="">
                          Automatic{autoName ? ` (${autoName})` : v.source === "ignored" ? "" : " (no match)"}
                        </option>
                        {[...groups.entries()].map(([cat, opts]) => (
                          <optgroup key={cat} label={cat}>
                            {opts
                              .filter((o) => o.active || o.id === v.interestId)
                              .map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                          </optgroup>
                        ))}
                        <option value={IGNORE_INTEREST}>Don&rsquo;t import this interest</option>
                      </select>
                    </td>
                    <td className="py-1.5 whitespace-nowrap">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:opacity-60 dark:border-zinc-700"
          >
            {pending ? "Re-reading…" : "Re-read file with these interests"}
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={remember}
              disabled={!anyChosen}
              onChange={(e) => onRememberChange(e.target.checked)}
            />
            Remember my picks for future uploads
            <span className="text-xs text-zinc-500">(saved when you apply)</span>
          </label>
        </div>
      </div>
    </details>
  );
}
