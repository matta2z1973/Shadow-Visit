"use client";

import { useActionState } from "react";
import { createDefaultTestHostsAction, type TestHostActionResult } from "./actions";

const initial: TestHostActionResult = { ok: false, message: "" };

export default function CreateDefaultsButton() {
  const [state, action, pending] = useActionState(createDefaultTestHostsAction, initial);

  return (
    <form action={action}>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-forest px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-forest dark:text-white"
      >
        {pending ? "Creating…" : "Create default test hosts"}
      </button>
      {state.message ? (
        <p
          className={`mt-2 text-sm ${state.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
