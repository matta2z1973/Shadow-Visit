"use client";

import { useActionState, useState } from "react";
import {
  previewProspectiveReport,
  type ApplyImportResult,
  type ProspectivePreviewResult,
} from "./prospective-report-actions";
import ProspectiveImportPreview from "./prospective-import-preview";
import ColumnMappingPanel from "./column-mapping-panel";
import InterestValuesPanel from "./interest-values-panel";
import { NOT_IN_FILE } from "@/lib/finalsite/prospective-import";
import { IGNORE_INTEREST } from "@/lib/finalsite/interest-matching";

const initial: ProspectivePreviewResult = {
  ok: false,
  previewId: "",
  message: "",
  perFile: [],
  rows: [],
  interestOptions: [],
  fileNames: [],
  mapping: null,
  interestValues: [],
};

// Step 1 uploads and previews (nothing saved); step 2 is the review table,
// which saves only when the admin clicks Apply. The column-mapping panel sits
// inside the form so "Re-read file" resubmits the same file with new picks.
export default function ProspectiveReportUploadForm() {
  const [state, action, pending] = useActionState(previewProspectiveReport, initial);
  const [closedPreviewId, setClosedPreviewId] = useState<string | null>(null);
  const [applied, setApplied] = useState<ApplyImportResult | null>(null);
  const [remember, setRemember] = useState(false);
  const [rememberInterestPicks, setRememberInterestPicks] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const open = state.previewId !== "" && state.previewId !== closedPreviewId;
  const showPreview = open && state.rows.length > 0;

  function close(result: ApplyImportResult | null) {
    setClosedPreviewId(state.previewId);
    setApplied(result);
    setRemember(false);
    setRememberInterestPicks(false);
    setFormKey((k) => k + 1); // clears the file input and column picks
  }

  // Only the picks the admin actually made; "Not in this file" forgets a
  // remembered name rather than remembering an absence.
  const rememberColumns =
    remember && state.mapping
      ? Object.fromEntries(
          state.mapping.fields
            .filter((f) => f.chosen !== "")
            .map((f) => [f.field, f.chosen === NOT_IN_FILE ? null : f.chosen]),
        )
      : null;

  // Only interests the admin explicitly picked. "Automatic" isn't sent, so a
  // remembered pick stays until the admin chooses something else for it.
  const rememberInterests = rememberInterestPicks
    ? Object.fromEntries(
        state.interestValues
          .filter((v) => v.chosen !== "")
          .map((v) => [v.key, v.chosen === IGNORE_INTEREST ? IGNORE_INTEREST : v.chosen]),
      )
    : null;

  return (
    <div>
      <form key={formKey} action={action} onSubmit={() => setApplied(null)} className="mt-4">
        <input
          type="file"
          name="files"
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          multiple
          required
          // A different file makes the current review and column picks stale.
          onChange={() => open && setClosedPreviewId(state.previewId)}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-forest file:px-4 file:py-2 file:text-sm file:font-medium file:text-white dark:file:bg-forest dark:file:text-white"
        />
        {!open ? (
          <button
            type="submit"
            disabled={pending}
            className="mt-3 rounded-md bg-forest px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-forest dark:text-white"
          >
            {pending ? "Reading file…" : "Upload and review changes"}
          </button>
        ) : null}

        {open && state.mapping ? (
          <ColumnMappingPanel
            key={state.previewId}
            mapping={state.mapping}
            pending={pending}
            remember={remember}
            onRememberChange={setRemember}
          />
        ) : null}
        {open ? (
          <InterestValuesPanel
            key={`i-${state.previewId}`}
            values={state.interestValues}
            options={state.interestOptions}
            pending={pending}
            remember={rememberInterestPicks}
            onRememberChange={setRememberInterestPicks}
          />
        ) : null}
      </form>

      {applied ? (
        <p className="mt-3 rounded-md bg-cool-green/10 px-3 py-2 text-sm text-forest dark:text-mint">
          {applied.message}
        </p>
      ) : null}

      {open && state.message ? (
        <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">{state.message}</p>
      ) : null}
      {open && state.perFile.length ? (
        <ul className="mt-2 divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
          {state.perFile.map((f, idx) => (
            <li key={idx} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:justify-between">
              <span className="font-mono text-xs text-zinc-500">{f.fileName}</span>
              <span>{f.status}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {showPreview ? (
        <ProspectiveImportPreview
          key={state.previewId}
          preview={state}
          rememberColumns={rememberColumns}
          rememberInterests={rememberInterests}
          onDone={(r) => close(r)}
          onCancel={() => close(null)}
        />
      ) : null}
      {open && !showPreview ? (
        <button
          type="button"
          onClick={() => close(null)}
          className="mt-3 rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
        >
          Start over
        </button>
      ) : null}
    </div>
  );
}
