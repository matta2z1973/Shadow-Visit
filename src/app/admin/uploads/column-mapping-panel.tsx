"use client";

import type { ColumnMappingView } from "./prospective-report-actions";
import { NOT_IN_FILE } from "@/lib/finalsite/prospective-import";

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  chosen: { label: "Your pick", cls: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200" },
  saved: { label: "Remembered", cls: "bg-cool-green/15 text-forest dark:text-mint" },
  exact: { label: "Matched", cls: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  fuzzy: { label: "Guessed — check", cls: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  missingRequired: { label: "Missing — required", cls: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
  missing: { label: "Not in file", cls: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400" },
};

// Rendered inside the upload <form>: each select is named map:<field>, so
// "Re-read file" resubmits the same file with these picks applied. Selects are
// uncontrolled and the parent keys this component by previewId, so they reset
// to what the server echoed back after every read.
export default function ColumnMappingPanel({
  mapping,
  pending,
  remember,
  onRememberChange,
}: {
  mapping: ColumnMappingView;
  pending: boolean;
  remember: boolean;
  onRememberChange: (v: boolean) => void;
}) {
  const problems = mapping.fields.filter(
    (f) => f.source === "fuzzy" || (!f.header && f.required),
  ).length;
  const anyChosen = mapping.fields.some((f) => f.chosen !== "");

  return (
    <details
      open={problems > 0 || anyChosen}
      className="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-800"
    >
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
        Column mapping{" "}
        <span className="font-normal text-zinc-500">
          — {mapping.fields.filter((f) => f.header).length} of {mapping.fields.length} fields found in{" "}
          {mapping.fileName}
          {problems ? ` · ${problems} to check` : ""}
        </span>
      </summary>
      <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <p className="text-xs text-zinc-500">
          If FinalSite renamed a column, pick the column it&rsquo;s called now and re-read the
          file. Tick &ldquo;remember&rdquo; to use the new name on every future upload.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="py-1 pr-3 font-medium">Platform field</th>
                <th className="py-1 pr-3 font-medium">Column in the file</th>
                <th className="py-1 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {mapping.fields.map((f) => {
                const badge = f.source
                  ? SOURCE_BADGE[f.source]
                  : SOURCE_BADGE[f.required ? "missingRequired" : "missing"];
                return (
                  <tr key={f.field}>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {f.label}
                      {f.required ? <span className="text-red-600"> *</span> : null}
                    </td>
                    <td className="py-1.5 pr-3">
                      <select
                        name={`map:${f.field}`}
                        defaultValue={f.chosen}
                        className="w-full min-w-48 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        <option value="">
                          Automatic{f.source !== "chosen" && f.header ? ` (${f.header})` : ""}
                        </option>
                        {mapping.headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                        <option value={NOT_IN_FILE}>Not in this file</option>
                      </select>
                      {f.savedHeader && f.source !== "saved" ? (
                        <span className="mt-0.5 block text-xs text-zinc-500">
                          Remembered as &ldquo;{f.savedHeader}&rdquo;
                          {f.source === "chosen" ? "" : " — not in this file"}
                        </span>
                      ) : null}
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

        <div className="mt-3 text-xs">
          <span className="font-medium text-zinc-600 dark:text-zinc-400">Columns in the file not used:</span>{" "}
          {mapping.unusedHeaders.length ? (
            mapping.unusedHeaders.map((h) => (
              <span
                key={h}
                className="mr-1 mt-1 inline-block rounded bg-zinc-100 px-1.5 py-0.5 font-mono dark:bg-zinc-800"
              >
                {h}
              </span>
            ))
          ) : (
            <span className="text-zinc-500">none</span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:opacity-60 dark:border-zinc-700"
          >
            {pending ? "Re-reading…" : "Re-read file with these columns"}
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
        <p className="mt-1 text-xs text-zinc-500">
          Re-reading resets any edits made to the rows below.
        </p>
      </div>
    </details>
  );
}
