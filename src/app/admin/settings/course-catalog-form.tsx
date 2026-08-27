"use client";

import { useActionState } from "react";
import { uploadCourseCatalogAction, clearCourseCatalog, type CourseCatalogResult } from "./actions";

const initial: CourseCatalogResult = { ok: false, message: "", courseCount: 0 };

export default function CourseCatalogForm({
  currentCount,
  lastUpdated,
}: {
  currentCount: number;
  lastUpdated: string | null;
}) {
  const [state, action, pending] = useActionState(uploadCourseCatalogAction, initial);

  return (
    <div className="mt-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {currentCount > 0
          ? `${currentCount} course(s) loaded${lastUpdated ? ` · last updated ${lastUpdated}` : ""}.`
          : "No course catalog uploaded yet — interest matching falls back to keyword matching until one is loaded."}
      </p>

      <form action={action} className="mt-3">
        <input
          type="file"
          name="file"
          accept=".pdf,.xlsx,.xls,.csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetsml.sheet"
          required
          className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-forest file:px-4 file:py-2 file:text-sm file:font-medium file:text-white dark:file:bg-forest dark:file:text-white"
        />
        <p className="mt-1 text-xs text-zinc-500">
          PDF course catalog (the reasoning provider selected above reads the whole document and
          picks out individual courses, skipping department overviews and graduation
          requirements) or a spreadsheet with a course name/title column and, ideally, a
          description column. Uploading replaces the entire catalog.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="mt-3 rounded-md bg-forest px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-forest dark:text-white"
        >
          {pending ? "Parsing catalog…" : "Upload catalog"}
        </button>
      </form>

      {state.message ? (
        <p
          className={`mt-3 text-sm ${state.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}
        >
          {state.message}
        </p>
      ) : null}

      {currentCount > 0 ? (
        <form action={clearCourseCatalog} className="mt-3">
          <button type="submit" className="text-xs text-red-600 hover:underline">
            Clear catalog
          </button>
        </form>
      ) : null}
    </div>
  );
}
