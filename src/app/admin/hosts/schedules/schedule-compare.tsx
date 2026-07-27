"use client";

import { useState } from "react";

export type HostData = {
  id: string;
  name: string;
  grade: number | null;
  gender: string | null;
  dayType: "green" | "gold" | null;
  byLetter: Record<
    string,
    { course: string | null; teacher: string | null; room: string | null }
  >;
};

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
const LETTER_TIME: Record<string, string> = {
  A: "8:30", B: "9:55", C: "11:50", D: "2:35",
  E: "8:30", F: "9:55", G: "11:50", H: "2:35",
};
const rotationOf = (letter: string): "green" | "gold" =>
  "ABCD".includes(letter) ? "green" : "gold";

export default function ScheduleCompare({
  date,
  hosts,
}: {
  date: string;
  hosts: HostData[];
}) {
  // Selection lives in React state → checkboxes and grid always agree, and the
  // grid updates instantly as you check/uncheck.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(hosts.map((h) => h.id)),
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectAll = () => setSelected(new Set(hosts.map((h) => h.id)));
  const clearAll = () => setSelected(new Set());

  const columns = hosts.filter((h) => selected.has(h.id));

  return (
    <>
      <div className="mt-5 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Compare hosts ({date}) · {selected.size} selected
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={selectAll}
              className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700"
            >
              Clear all
            </button>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4">
          {hosts.map((h) => (
            <label key={h.id} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={selected.has(h.id)}
                onChange={() => toggle(h.id)}
                className="h-4 w-4"
              />
              <span>
                {h.name}
                <span className="ml-1 text-xs text-zinc-400">
                  {h.grade ?? "?"}·{h.gender ?? "?"}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {columns.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500">
          Select one or more hosts to compare.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-zinc-200 bg-white p-2 text-left dark:border-zinc-800 dark:bg-zinc-950">
                  Block
                </th>
                {columns.map((c) => (
                  <th
                    key={c.id}
                    className="min-w-40 border-b border-l border-zinc-200 p-2 text-left align-bottom dark:border-zinc-800"
                  >
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs font-normal text-zinc-500">
                      Grade {c.grade ?? "?"} · {c.gender ?? "?"} ·{" "}
                      <span
                        className={
                          c.dayType === "green"
                            ? "text-green-700 dark:text-green-400"
                            : "text-amber-700 dark:text-amber-400"
                        }
                      >
                        {c.dayType ?? "?"} day
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LETTERS.map((letter, i) => {
                const rot = rotationOf(letter);
                const groupStart = letter === "A" || letter === "E";
                return (
                  <tr
                    key={letter}
                    className={
                      i > 0 && groupStart
                        ? "border-t-2 border-zinc-300 dark:border-zinc-700"
                        : ""
                    }
                  >
                    <td className="sticky left-0 z-10 border-b border-zinc-100 bg-white p-2 dark:border-zinc-900 dark:bg-zinc-950">
                      <span
                        className={`font-semibold ${rot === "green" ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`}
                      >
                        {letter}
                      </span>
                      <span className="ml-1 text-xs text-zinc-400">
                        {LETTER_TIME[letter]}
                      </span>
                    </td>
                    {columns.map((c) => {
                      if (c.dayType && c.dayType !== rot) {
                        return (
                          <td
                            key={c.id}
                            className="border-b border-l border-zinc-100 bg-zinc-50 p-2 text-center text-xs text-zinc-300 dark:border-zinc-900 dark:bg-zinc-900 dark:text-zinc-600"
                          >
                            ·
                          </td>
                        );
                      }
                      const b = c.byLetter[letter];
                      return (
                        <td
                          key={c.id}
                          className="border-b border-l border-zinc-100 p-2 dark:border-zinc-900"
                          title={
                            b?.room || b?.teacher
                              ? `${b?.room ?? ""} ${b?.teacher ?? ""}`.trim()
                              : undefined
                          }
                        >
                          {b ? (
                            <div>
                              <div>{b.course ?? "—"}</div>
                              {b.teacher ? (
                                <div className="text-xs text-zinc-400">
                                  {b.teacher}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-xs italic text-zinc-400">
                              free
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
