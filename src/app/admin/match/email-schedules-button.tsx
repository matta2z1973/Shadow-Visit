"use client";

import { useActionState } from "react";
import { emailSchedulesForDate, type EmailSchedulesResult } from "./actions";

const initial: EmailSchedulesResult = { ok: false, message: "" };

export default function EmailSchedulesButton({ date }: { date: string }) {
  const [state, action, pending] = useActionState(emailSchedulesForDate, initial);

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={action}>
        <input type="hidden" name="date" value={date} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-60 dark:border-zinc-700"
        >
          {pending ? "Sending…" : "Email schedules to hosts"}
        </button>
      </form>
      {state.message ? (
        <span className="max-w-72 text-right text-xs text-zinc-500">{state.message}</span>
      ) : null}
    </div>
  );
}
