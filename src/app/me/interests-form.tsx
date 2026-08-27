"use client";

import { useActionState } from "react";
import { saveMe, type SaveState } from "./actions";

type Interest = { id: string; name: string };

const initial: SaveState = { ok: false, message: "" };

function CheckGroup({
  title,
  items,
  selectedIds,
}: {
  title: string;
  items: Interest[];
  selectedIds: string[];
}) {
  return (
    <fieldset className="mt-6">
      <legend className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
      </legend>
      <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {items.map((i) => (
          <label key={i.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="interestIds"
              value={i.id}
              defaultChecked={selectedIds.includes(i.id)}
              className="h-4 w-4 rounded border-zinc-300"
            />
            <span>{i.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function InterestsForm({
  host,
  groups,
  selectedIds,
}: {
  host: { grade: number | null; gender: "M" | "F" | null };
  groups: { label: string; items: Interest[] }[];
  selectedIds: string[];
}) {
  const [state, action, pending] = useActionState(saveMe, initial);

  return (
    <form action={action} className="mt-6">
      <div className="flex flex-wrap gap-6">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Grade</span>
          <input
            name="grade"
            type="number"
            min={1}
            max={12}
            defaultValue={host.grade ?? ""}
            className="w-24 rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Gender</span>
          <div className="flex gap-4 py-2">
            {(["M", "F"] as const).map((g) => (
              <label key={g} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="gender"
                  value={g}
                  defaultChecked={host.gender === g}
                />
                <span>{g === "M" ? "Male" : "Female"}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {groups.map((g) => (
        <CheckGroup
          key={g.label}
          title={g.label}
          items={g.items}
          selectedIds={selectedIds}
        />
      ))}

      <div className="mt-8 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-forest px-4 py-2 text-sm font-medium text-white hover:bg-forest/90 disabled:opacity-60 dark:bg-forest dark:text-white"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state.message ? (
          <span
            className={
              state.ok
                ? "text-sm text-green-700 dark:text-green-400"
                : "text-sm text-red-700 dark:text-red-400"
            }
          >
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
