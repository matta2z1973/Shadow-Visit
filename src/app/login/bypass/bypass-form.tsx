"use client";

import { useActionState } from "react";
import { bypassLogin, type BypassState } from "./actions";

const initial: BypassState = { ok: false, message: "" };

export default function BypassForm() {
  const [state, action, pending] = useActionState(bypassLogin, initial);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input
        name="token"
        type="password"
        autoComplete="off"
        required
        autoFocus
        placeholder="Bypass token"
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-forest px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-forest dark:text-white"
      >
        {pending ? "Checking…" : "Enter"}
      </button>
      {state.message ? (
        <p className="text-sm text-red-700 dark:text-red-400">{state.message}</p>
      ) : null}
    </form>
  );
}
