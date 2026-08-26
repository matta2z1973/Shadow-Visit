"use client";

import { useActionState } from "react";
import { emailScheduleToHost } from "./email-actions";
import type { EmailHostScheduleResult } from "@/lib/matching/email-host-schedule";

const initial: EmailHostScheduleResult = { ok: false, message: "" };

export default function EmailScheduleButton({ matchId }: { matchId: string }) {
  const [state, action, pending] = useActionState(emailScheduleToHost, initial);

  return (
    <div className="flex flex-col items-end gap-1 print:hidden">
      <form action={action}>
        <input type="hidden" name="matchId" value={matchId} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-60 dark:border-zinc-700"
        >
          {pending ? "Sending…" : "Email to host"}
        </button>
      </form>
      {state.message ? (
        <span className={`max-w-56 text-right text-xs ${state.ok ? "text-zinc-500" : "text-red-600"}`}>
          {state.message}
        </span>
      ) : null}
    </div>
  );
}
