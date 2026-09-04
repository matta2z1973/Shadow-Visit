"use client";

import { useActionState } from "react";
import { saveSeasonAction, type SaveSeasonResult } from "./actions";

const initial: SaveSeasonResult = { ok: false, message: "" };

export default function SeasonForm({
  currentStart,
  currentEnd,
}: {
  currentStart: string | null;
  currentEnd: string | null;
}) {
  const [state, action, pending] = useActionState(saveSeasonAction, initial);

  return (
    <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Start date</span>
        <input
          type="date"
          name="start"
          required
          defaultValue={currentStart ?? ""}
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">End date</span>
        <input
          type="date"
          name="end"
          required
          defaultValue={currentEnd ?? ""}
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-forest px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-forest dark:text-white"
      >
        {pending ? "Saving…" : "Save season"}
      </button>

      {state.message ? (
        <p
          className={`w-full text-sm ${state.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
