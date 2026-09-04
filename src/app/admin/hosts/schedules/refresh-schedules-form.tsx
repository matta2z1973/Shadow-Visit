"use client";

import { useActionState } from "react";
import { refreshSchedules, type RefreshState } from "./actions";

const initial: RefreshState = { ok: false, message: "" };

export default function RefreshSchedulesForm() {
  const [state, action, pending] = useActionState(refreshSchedules, initial);

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-60 dark:border-zinc-700"
      >
        {pending ? "Syncing…" : "Refresh schedules"}
      </button>
      <span className="max-w-xs text-right text-xs text-zinc-500">
        {pending
          ? "Pulling from Outlook for every linked host across the whole season — this can take a little while."
          : state.message}
      </span>
    </form>
  );
}
