"use client";

import { useActionState } from "react";
import { saveMyScheduleLink, clearMyScheduleLink, type ScheduleLinkState } from "./schedule-actions";

const initial: ScheduleLinkState = { ok: false, message: "" };

export default function ScheduleLinkForm({ currentUrl }: { currentUrl: string | null }) {
  const [state, action, pending] = useActionState(saveMyScheduleLink, initial);

  return (
    <div className="mt-4">
      <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <input
          type="url"
          name="icsUrl"
          placeholder="https://outlook.office365.com/owa/calendar/.../calendar.ics"
          defaultValue={currentUrl ?? ""}
          required
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? "Checking…" : "Save"}
        </button>
      </form>
      {state.message ? (
        <p className={`mt-2 text-sm ${state.ok ? "text-zinc-700 dark:text-zinc-300" : "text-red-600"}`}>
          {state.message}
        </p>
      ) : null}
      {currentUrl ? (
        <form action={clearMyScheduleLink} className="mt-2">
          <button type="submit" className="text-xs text-red-600 hover:underline">
            remove saved link
          </button>
        </form>
      ) : null}
    </div>
  );
}
