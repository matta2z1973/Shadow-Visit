"use client";

// The host roster as a sortable, filterable table.
//
// Sorting and filtering are client-side on purpose: the whole roster is a few
// hundred rows at most and the page already loads all of it (the interests
// filter needs every host's interest links anyway), so doing this in the URL
// + a server round trip per click would be slower and would lose the open row.
//
// Each row collapses to one scannable line. Everything that used to be on the
// always-open card — the name/grade/gender/active edit form, the calendar
// link, the interest checkboxes, delete — moves into the expanded drawer, so
// no admin capability is lost, it just stops competing for attention with the
// other 200 hosts.

import { useMemo, useState } from "react";
import { INTEREST_CATEGORIES } from "@/lib/interest-categories";
import { updateHost, setHostInterests, deleteHost, setHostFeed } from "./actions";

export type HostRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  grade: number | null;
  gender: "M" | "F" | null;
  active: boolean;
  icsUrl: string | null;
  visits: number;
  hasSchedule: boolean;
  interestIds: string[];
};

export type InterestOption = { id: string; name: string; category: string };

type SortKey = "firstName" | "lastName" | "grade";
type SortDir = "asc" | "desc";

const NO_VALUE = "__none__";

const field =
  "rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

// Rows with no value for the sorted column always sink to the bottom, in both
// directions — flipping the arrow is meant to reverse the hosts you can see,
// not to bury them under a block of blanks.
function compare(a: HostRow, b: HostRow, key: SortKey, dir: SortDir): number {
  const flip = dir === "asc" ? 1 : -1;
  if (key === "grade") {
    if (a.grade == null && b.grade == null) return 0;
    if (a.grade == null) return 1;
    if (b.grade == null) return -1;
    return (a.grade - b.grade) * flip;
  }
  const av = (key === "firstName" ? a.firstName : a.lastName)?.trim() ?? "";
  const bv = (key === "firstName" ? b.firstName : b.lastName)?.trim() ?? "";
  if (!av && !bv) return 0;
  if (!av) return 1;
  if (!bv) return -1;
  return av.localeCompare(bv, undefined, { sensitivity: "base" }) * flip;
}

function Pill({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={
        on
          ? "rounded-full bg-forest px-2.5 py-1 text-xs font-medium text-white"
          : "rounded-full border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      }
    >
      {children}
    </button>
  );
}

function SortHeader({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === col;
  return (
    <th
      scope="col"
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      className={`px-3 py-2 text-left font-semibold ${className ?? ""}`}
    >
      <button
        type="button"
        onClick={() => onSort(col)}
        className="inline-flex items-center gap-1 hover:underline"
      >
        {label}
        <span aria-hidden className={active ? "" : "text-zinc-300 dark:text-zinc-600"}>
          {active ? (sortDir === "asc" ? "▲" : "▼") : "▲"}
        </span>
      </button>
    </th>
  );
}

export default function HostsTable({
  hosts,
  allInterests,
  softCap,
}: {
  hosts: HostRow[];
  allInterests: InterestOption[];
  softCap: number;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("lastName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [grades, setGrades] = useState<Set<string>>(new Set());
  const [genders, setGenders] = useState<Set<string>>(new Set());
  const [interestIds, setInterestIds] = useState<Set<string>>(new Set());
  // With two or more interests picked, "any" and "all" answer different
  // questions ("who could cover either of these?" vs "who covers both?"),
  // and both get asked when staffing a visit.
  const [interestMode, setInterestMode] = useState<"any" | "all">("any");
  const [openId, setOpenId] = useState<string | null>(null);

  const interestName = useMemo(
    () => new Map(allInterests.map((i) => [i.id, i.name])),
    [allInterests],
  );

  const gradeOptions = useMemo(() => {
    const present = new Set<number>();
    let anyMissing = false;
    for (const h of hosts) {
      if (h.grade == null) anyMissing = true;
      else present.add(h.grade);
    }
    return {
      grades: [...present].sort((a, b) => a - b),
      anyMissing,
    };
  }, [hosts]);

  const visible = useMemo(() => {
    const rows = hosts.filter((h) => {
      if (grades.size) {
        const key = h.grade == null ? NO_VALUE : String(h.grade);
        if (!grades.has(key)) return false;
      }
      if (genders.size) {
        const key = h.gender ?? NO_VALUE;
        if (!genders.has(key)) return false;
      }
      if (interestIds.size) {
        const owned = new Set(h.interestIds);
        const picked = [...interestIds];
        const ok =
          interestMode === "all"
            ? picked.every((id) => owned.has(id))
            : picked.some((id) => owned.has(id));
        if (!ok) return false;
      }
      return true;
    });
    return rows.sort((a, b) => compare(a, b, sortKey, sortDir));
  }, [hosts, grades, genders, interestIds, interestMode, sortKey, sortDir]);

  const onSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  };

  const filtersOn = grades.size > 0 || genders.size > 0 || interestIds.size > 0;
  const clearAll = () => {
    setGrades(new Set());
    setGenders(new Set());
    setInterestIds(new Set());
  };

  return (
    <div className="mt-6">
      {/* Filters */}
      <div className="rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Grade
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {gradeOptions.grades.map((g) => (
                <Pill
                  key={g}
                  on={grades.has(String(g))}
                  onClick={() => setGrades(toggle(grades, String(g)))}
                >
                  {g}
                </Pill>
              ))}
              {gradeOptions.anyMissing ? (
                <Pill on={grades.has(NO_VALUE)} onClick={() => setGrades(toggle(grades, NO_VALUE))}>
                  No grade
                </Pill>
              ) : null}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Gender
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Pill on={genders.has("M")} onClick={() => setGenders(toggle(genders, "M"))}>
                Male
              </Pill>
              <Pill on={genders.has("F")} onClick={() => setGenders(toggle(genders, "F"))}>
                Female
              </Pill>
              <Pill on={genders.has(NO_VALUE)} onClick={() => setGenders(toggle(genders, NO_VALUE))}>
                Unset
              </Pill>
            </div>
          </div>

          <div className="min-w-[16rem] flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Interests
              </span>
              {interestIds.size > 1 ? (
                <span className="flex items-center gap-1 text-xs text-zinc-500">
                  match
                  <button
                    type="button"
                    onClick={() => setInterestMode(interestMode === "any" ? "all" : "any")}
                    className="rounded border border-zinc-300 px-1.5 py-0.5 font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    {interestMode === "any" ? "any" : "all"}
                  </button>
                </span>
              ) : null}
            </div>
            <details className="mt-1.5">
              <summary className="inline-block w-fit cursor-pointer list-none rounded-md border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900">
                {interestIds.size === 0
                  ? "Any interest ▾"
                  : `${interestIds.size} selected ▾`}
              </summary>
              <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
                {INTEREST_CATEGORIES.map((c) => {
                  const items = allInterests.filter((i) => i.category === c.slug);
                  if (!items.length) return null;
                  return (
                    <fieldset key={c.slug} className="mt-1 first:mt-0">
                      <legend className="text-xs font-semibold text-zinc-500">{c.label}</legend>
                      <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-3">
                        {items.map((i) => (
                          <label key={i.id} className="flex items-center gap-1.5 text-xs">
                            <input
                              type="checkbox"
                              checked={interestIds.has(i.id)}
                              onChange={() => setInterestIds(toggle(interestIds, i.id))}
                              className="h-3.5 w-3.5"
                            />
                            <span>{i.name}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  );
                })}
              </div>
            </details>
            {interestIds.size ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {[...interestIds].map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setInterestIds(toggle(interestIds, id))}
                    className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    {interestName.get(id) ?? "?"} ✕
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3 border-t border-zinc-200 pt-2 text-xs text-zinc-500 dark:border-zinc-800">
          <span>
            Showing <strong>{visible.length}</strong> of {hosts.length}
          </span>
          {filtersOn ? (
            <button type="button" onClick={clearAll} className="text-forest hover:underline dark:text-emerald-400">
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            <tr>
              <th scope="col" className="w-8 px-2 py-2">
                <span className="sr-only">Expand</span>
              </th>
              <SortHeader label="First name" col="firstName" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortHeader label="Last name" col="lastName" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortHeader label="Grade" col="grade" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="w-20" />
              <th scope="col" className="w-20 px-3 py-2 text-left font-semibold">
                Gender
              </th>
              <th scope="col" className="w-28 px-3 py-2 text-left font-semibold">
                Outlook
              </th>
              <th scope="col" className="w-24 px-3 py-2 text-left font-semibold">
                Visits
              </th>
              <th scope="col" className="w-28 px-3 py-2 text-left font-semibold">
                Interests
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-zinc-500">
                  {hosts.length === 0
                    ? "No hosts yet. Upload host schedules or have students log in."
                    : "No hosts match these filters."}
                </td>
              </tr>
            ) : (
              visible.map((h) => {
                const open = openId === h.id;
                const over = h.visits >= softCap;
                return (
                  <HostRowView
                    key={h.id}
                    host={h}
                    open={open}
                    over={over}
                    softCap={softCap}
                    allInterests={allInterests}
                    onToggle={() => setOpenId(open ? null : h.id)}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HostRowView({
  host: h,
  open,
  over,
  softCap,
  allInterests,
  onToggle,
}: {
  host: HostRow;
  open: boolean;
  over: boolean;
  softCap: number;
  allInterests: InterestOption[];
  onToggle: () => void;
}) {
  const selected = new Set(h.interestIds);
  return (
    <>
      <tr
        className={`border-b border-zinc-100 dark:border-zinc-800/60 ${
          open ? "bg-zinc-50 dark:bg-zinc-900" : ""
        } ${h.active ? "" : "opacity-60"}`}
      >
        <td className="px-2 py-2 align-middle">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${h.fullName}`}
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <span aria-hidden>{open ? "▾" : "▸"}</span>
          </button>
        </td>
        <td className="px-3 py-2">
          {h.firstName || <span className="text-zinc-400">—</span>}
          {!h.active ? (
            <span className="ml-2 rounded bg-zinc-200 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
              inactive
            </span>
          ) : null}
        </td>
        <td className="px-3 py-2">{h.lastName || <span className="text-zinc-400">—</span>}</td>
        <td className="px-3 py-2 tabular-nums">
          {h.grade ?? <span className="text-zinc-400">—</span>}
        </td>
        <td className="px-3 py-2">{h.gender ?? <span className="text-zinc-400">—</span>}</td>
        <td className="px-3 py-2">
          {h.icsUrl ? (
            <a
              href={h.icsUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={h.icsUrl}
              className="text-forest underline-offset-2 hover:underline dark:text-emerald-400"
            >
              Calendar ↗
            </a>
          ) : h.hasSchedule ? (
            <span className="text-xs text-zinc-500" title="Schedule came from a legacy CSV import, not a live link">
              imported
            </span>
          ) : (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              no link
            </span>
          )}
        </td>
        <td className="px-3 py-2 tabular-nums">
          {h.visits}/{softCap}
          {over ? (
            <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              cap
            </span>
          ) : null}
        </td>
        <td className="px-3 py-2">
          <button
            type="button"
            onClick={onToggle}
            className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            {h.interestIds.length} ▾
          </button>
        </td>
      </tr>

      {open ? (
        <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
          <td colSpan={8} className="px-4 py-4">
            <form action={updateHost} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={h.id} />
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-zinc-500">First name</span>
                <input name="firstName" defaultValue={h.firstName ?? ""} className={`${field} w-32`} />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-zinc-500">Last name</span>
                <input name="lastName" defaultValue={h.lastName ?? ""} className={`${field} w-32`} />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-zinc-500">Grade</span>
                <input name="grade" type="number" min={1} max={12} defaultValue={h.grade ?? ""} className={`${field} w-16`} />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-zinc-500">Gender</span>
                <select name="gender" defaultValue={h.gender ?? ""} className={field}>
                  <option value="">—</option>
                  <option value="M">M</option>
                  <option value="F">F</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5 pb-1.5 text-xs">
                <input type="checkbox" name="active" defaultChecked={h.active} className="h-4 w-4" />
                <span>Active</span>
              </label>
              <button
                type="submit"
                className="rounded-md bg-forest px-3 py-1.5 text-sm font-medium text-white dark:bg-forest dark:text-white"
              >
                Save
              </button>
            </form>

            <form action={setHostFeed} className="mt-3 flex items-center gap-2">
              <input type="hidden" name="id" value={h.id} />
              <input
                name="icsUrl"
                type="url"
                defaultValue={h.icsUrl ?? ""}
                placeholder="Calendar .ics link (Outlook: Publish a calendar → titles and locations)"
                className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
              />
              <button type="submit" className="text-xs text-zinc-500 underline-offset-2 hover:underline">
                save link
              </button>
            </form>

            <form action={setHostInterests} className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <input type="hidden" name="id" value={h.id} />
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Interests ({selected.size})
              </div>
              {INTEREST_CATEGORIES.map((c) => {
                const items = allInterests.filter((i) => i.category === c.slug);
                if (!items.length) return null;
                return (
                  <fieldset key={c.slug} className="mt-2">
                    <legend className="text-xs font-semibold text-zinc-500">{c.label}</legend>
                    <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4">
                      {items.map((i) => (
                        <label key={i.id} className="flex items-center gap-1.5 text-sm">
                          <input
                            type="checkbox"
                            name="interestIds"
                            value={i.id}
                            defaultChecked={selected.has(i.id)}
                            className="h-4 w-4"
                          />
                          <span>{i.name}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                );
              })}
              <button
                type="submit"
                className="mt-3 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
              >
                Save interests
              </button>
            </form>

            <form action={deleteHost} className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <input type="hidden" name="id" value={h.id} />
              <button type="submit" className="text-xs text-red-600 hover:underline">
                delete host
              </button>
            </form>
          </td>
        </tr>
      ) : null}
    </>
  );
}
