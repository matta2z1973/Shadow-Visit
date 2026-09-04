"use client";

import { useActionState } from "react";
import { saveTestHostAction, deleteTestHostAction, type TestHostActionResult } from "./actions";
import { BLOCK_LETTERS, COURSE_CATEGORIES, TEST_COURSE_CATALOG, dayTypeForLetter } from "@/lib/schedule/test-course-catalog";

const initial: TestHostActionResult = { ok: false, message: "" };

type InterestCategory = { slug: string; label: string };
type Interest = { id: string; name: string; category: string };

export default function TestHostCard({
  host,
  courseByLetter,
  selectedInterestIds,
  interestCategories,
  allInterests,
}: {
  host: { id: string; fullName: string; grade: number | null; gender: "M" | "F" | null };
  courseByLetter: Record<string, string | null>;
  selectedInterestIds: string[];
  interestCategories: readonly InterestCategory[];
  allInterests: Interest[];
}) {
  const [state, action, pending] = useActionState(saveTestHostAction, initial);
  const selected = new Set(selectedInterestIds);

  return (
    <details className="rounded-lg border border-zinc-200 dark:border-zinc-800" open>
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
        {host.fullName} · grade {host.grade ?? "?"} · {host.gender ?? "?"}
      </summary>
      <form action={action} className="border-t border-zinc-200 p-4 dark:border-zinc-800">
        <input type="hidden" name="hostId" value={host.id} />

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-zinc-500">Name</span>
            <input
              name="fullName"
              defaultValue={host.fullName}
              className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-zinc-500">Grade</span>
            <input
              name="grade"
              type="number"
              min={1}
              max={12}
              defaultValue={host.grade ?? ""}
              className="w-16 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-zinc-500">Gender</span>
            <select
              name="gender"
              defaultValue={host.gender ?? "M"}
              className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="M">M</option>
              <option value="F">F</option>
            </select>
          </label>
        </div>

        <div className="mt-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Classes (applied to every weekday in the season)
          </span>
          <div className="mt-1 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-zinc-500">Green day</div>
              {BLOCK_LETTERS.filter((l) => dayTypeForLetter(l) === "green").map((letter) => (
                <BlockRow key={letter} letter={letter} current={courseByLetter[letter] ?? null} />
              ))}
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-zinc-500">Gold day</div>
              {BLOCK_LETTERS.filter((l) => dayTypeForLetter(l) === "gold").map((letter) => (
                <BlockRow key={letter} letter={letter} current={courseByLetter[letter] ?? null} />
              ))}
            </div>
          </div>
        </div>

        <details className="mt-3 rounded-md border border-zinc-200 dark:border-zinc-800">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
            Interests ({selected.size})
          </summary>
          <div className="px-3 pb-3">
            {interestCategories.map((c) => {
              const items = allInterests.filter((i) => i.category === c.slug);
              if (!items.length) return null;
              return (
                <fieldset key={c.slug} className="mt-2">
                  <legend className="text-xs font-semibold text-zinc-500">{c.label}</legend>
                  <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-3">
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
          </div>
        </details>

        <div className="mt-3 flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-forest px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-forest dark:text-white"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          {state.message ? (
            <p
              className={`text-sm ${state.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}
            >
              {state.message}
            </p>
          ) : null}
        </div>
      </form>

      <form action={deleteTestHostAction} className="border-t border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <input type="hidden" name="hostId" value={host.id} />
        <button type="submit" className="text-xs text-red-600 hover:underline">
          Delete this test host
        </button>
      </form>
    </details>
  );
}

function BlockRow({ letter, current }: { letter: string; current: string | null }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 text-xs text-zinc-500">{letter}</span>
      <select
        name={`block${letter}Course`}
        defaultValue={current ?? ""}
        className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      >
        <option value="">Free block</option>
        {COURSE_CATEGORIES.map((c) => (
          <optgroup key={c.slug} label={c.label}>
            {TEST_COURSE_CATALOG[c.slug].map((title) => (
              <option key={title} value={title}>
                {title}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
