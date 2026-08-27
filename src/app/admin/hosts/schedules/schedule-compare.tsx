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
  interestIds: string[];
};

export type InterestOption = { id: string; name: string };

const GRADES = [5, 6, 7, 8, 9, 10, 11, 12] as const;

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
  interestOptions,
}: {
  date: string;
  hosts: HostData[];
  interestOptions: InterestOption[];
}) {
  // Selection lives in React state → checkboxes and grid always agree, and the
  // grid updates instantly as you check/uncheck.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(hosts.map((h) => h.id)),
  );

  const [gradeFilter, setGradeFilter] = useState<string>("");
  const [genderFilter, setGenderFilter] = useState<string>("");
  const [interestFilter, setInterestFilter] = useState<Set<string>>(new Set());
  const filtersActive = gradeFilter !== "" || genderFilter !== "" || interestFilter.size > 0;

  const filteredHosts = hosts.filter((h) => {
    if (gradeFilter && String(h.grade ?? "") !== gradeFilter) return false;
    if (genderFilter && h.gender !== genderFilter) return false;
    if (interestFilter.size > 0 && !h.interestIds.some((id) => interestFilter.has(id))) {
      return false;
    }
    return true;
  });
  const visibleHosts = filtersActive ? filteredHosts : hosts;

  // Setting a filter narrows what's selectable, so it starts selection over —
  // the equivalent of clicking "Clear all" for the newly filtered list.
  function updateGradeFilter(value: string) {
    setGradeFilter(value);
    setSelected(new Set());
  }
  function updateGenderFilter(value: string) {
    setGenderFilter(value);
    setSelected(new Set());
  }
  function toggleInterestFilter(id: string) {
    setInterestFilter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelected(new Set());
  }
  function clearFilters() {
    setGradeFilter("");
    setGenderFilter("");
    setInterestFilter(new Set());
    setSelected(new Set());
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // Applies only to whatever the filters currently show — see visibleHosts.
  const selectAll = () => setSelected(new Set(visibleHosts.map((h) => h.id)));
  const clearAll = () => setSelected(new Set());

  const columns = hosts.filter((h) => selected.has(h.id));

  return (
    <>
      <div className="mt-5 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex flex-wrap items-end gap-3 border-b border-zinc-100 pb-3 dark:border-zinc-900">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-zinc-500">Grade</span>
            <select
              value={gradeFilter}
              onChange={(e) => updateGradeFilter(e.target.value)}
              className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">Any</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-zinc-500">Gender</span>
            <select
              value={genderFilter}
              onChange={(e) => updateGenderFilter(e.target.value)}
              className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">Any</option>
              <option value="M">M</option>
              <option value="F">F</option>
            </select>
          </label>
          <div className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-zinc-500">Interests</span>
            <details className="relative">
              <summary className="cursor-pointer rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700">
                {interestFilter.size > 0 ? `${interestFilter.size} selected` : "Any"}
              </summary>
              <div className="absolute z-20 mt-1 max-h-56 w-56 overflow-y-auto rounded-md border border-zinc-300 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                {interestOptions.map((i) => (
                  <label key={i.id} className="flex items-center gap-1.5 py-0.5 text-sm">
                    <input
                      type="checkbox"
                      checked={interestFilter.has(i.id)}
                      onChange={() => toggleInterestFilter(i.id)}
                      className="h-3.5 w-3.5"
                    />
                    <span>{i.name}</span>
                  </label>
                ))}
              </div>
            </details>
          </div>
          {filtersActive ? (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs text-zinc-500 underline-offset-2 hover:underline"
            >
              Clear filters
            </button>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Compare hosts ({date}) · {selected.size} selected
            {filtersActive ? ` · ${visibleHosts.length} match filters` : ""}
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
          {visibleHosts.length === 0 ? (
            <p className="col-span-full text-sm text-zinc-500">No hosts match these filters.</p>
          ) : null}
          {visibleHosts.map((h) => (
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
