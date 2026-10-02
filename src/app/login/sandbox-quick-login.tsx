"use client";

import { useActionState } from "react";
import { sandboxQuickLogin, type QuickLoginState } from "./sandbox-actions";

const initial: QuickLoginState = { ok: false, message: "" };

// Rendered only when the server says the gate is open — this component never
// decides that for itself, and the server action re-checks regardless.
export default function SandboxQuickLogin({ emails }: { emails: string[] }) {
  const [state, action, pending] = useActionState(sandboxQuickLogin, initial);

  return (
    <div className="rounded-lg border border-copper/40 bg-copper/5 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="rounded bg-copper px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          Sandbox
        </span>
        <span className="text-sm font-medium">Skip the emailed code</span>
      </div>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        Test data only. These accounts don&rsquo;t exist on the live site.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {emails.map((email) => (
          <form key={email} action={action}>
            <input type="hidden" name="email" value={email} />
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-left text-sm hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              {pending ? "Signing in…" : `Sign in as ${email}`}
            </button>
          </form>
        ))}
      </div>
      {state.message ? (
        <p className="mt-2 text-xs text-red-600" role="status">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
