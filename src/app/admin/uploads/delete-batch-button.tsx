"use client";

import { useActionState } from "react";
import { deleteImportBatch, type DeleteBatchResult } from "./prospective-report-actions";

const initial: DeleteBatchResult = { ok: false, message: "" };

export default function DeleteBatchButton({
  batchId,
  fileName,
  studentCount,
}: {
  batchId: string;
  fileName: string;
  studentCount: number;
}) {
  const [state, action, pending] = useActionState(deleteImportBatch, initial);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const proceed = window.confirm(
      studentCount > 0
        ? `Delete "${fileName}" and the ${studentCount} prospective student(s) it added? This also removes their interests, flags, and any match tied to them. This can't be undone.`
        : `Delete "${fileName}"? No prospective students are still associated with it (they've likely since been updated by a later upload).`,
    );
    if (!proceed) e.preventDefault();
  }

  return (
    <form action={action} onSubmit={handleSubmit} className="flex flex-col items-end gap-0.5">
      <input type="hidden" name="batchId" value={batchId} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-red-600 underline-offset-2 hover:underline disabled:opacity-60"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {state.message ? (
        <span
          className={`text-xs ${state.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
