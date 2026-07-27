"use client";

import { useActionState } from "react";
import {
  uploadProspectiveForms,
  type ProspectiveUploadResult,
} from "./prospective-actions";

const initial: ProspectiveUploadResult = { ok: false, message: "", perFile: [] };

export default function ProspectiveUploadForm() {
  const [state, action, pending] = useActionState(uploadProspectiveForms, initial);

  return (
    <form action={action} className="mt-4">
      <input
        type="file"
        name="files"
        accept="application/pdf,.pdf"
        multiple
        required
        className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white dark:file:bg-zinc-100 dark:file:text-zinc-900"
      />
      <button
        type="submit"
        disabled={pending}
        className="mt-3 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Parsing…" : "Upload Interview & Visit Forms"}
      </button>

      {state.message ? (
        <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">{state.message}</p>
      ) : null}
      {state.perFile.length ? (
        <ul className="mt-2 divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
          {state.perFile.map((f, idx) => (
            <li key={idx} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:justify-between">
              <span className="font-mono text-xs text-zinc-500">{f.fileName}</span>
              <span>{f.status}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
