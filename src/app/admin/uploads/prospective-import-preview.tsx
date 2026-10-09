"use client";

import { useMemo, useState, useTransition } from "react";
import {
  applyProspectiveImport,
  type ApplyImportResult,
  type ProspectivePreviewResult,
} from "./prospective-report-actions";
import {
  FIELD_LABELS,
  INTEREST_SLOTS,
  rowAttention,
  rowStatus,
  type ExistingCandidate,
  type ImportValues,
  type InterestOption,
  type RowStatus,
} from "@/lib/finalsite/prospective-import";

type Edit = { include: boolean; targetId: string | null; values: ImportValues };
type Filter = "all" | "new" | "update" | "unchanged" | "attention";

const STATUS_STYLE: Record<RowStatus, { label: string; cls: string }> = {
  new: { label: "New", cls: "bg-cool-green/15 text-forest dark:text-mint" },
  update: { label: "Changes", cls: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  unchanged: { label: "No change", cls: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
  invalid: { label: "No name", cls: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
};

const input =
  "mt-0.5 block w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export default function ProspectiveImportPreview({
  preview,
  rememberColumns,
  rememberInterests,
  onDone,
  onCancel,
}: {
  preview: ProspectivePreviewResult;
  rememberColumns: Record<string, string | null> | null;
  rememberInterests: Record<string, string | null> | null;
  onDone: (result: ApplyImportResult) => void;
  onCancel: () => void;
}) {
  const [edits, setEdits] = useState<Record<string, Edit>>(() =>
    Object.fromEntries(
      preview.rows.map((r) => {
        const target = r.candidates.find((c) => c.id === r.defaultTargetId) ?? null;
        const { status } = rowStatus(r.parsed, target);
        return [
          r.key,
          {
            // A repeated name would otherwise apply twice; an unchanged row
            // has nothing to apply. Both start unticked.
            include: !r.duplicateInFile && (status === "new" || status === "update"),
            targetId: r.defaultTargetId,
            values: r.parsed,
          },
        ];
      }),
    ),
  );
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const interestName = useMemo(
    () => new Map(preview.interestOptions.map((i) => [i.id, i.name])),
    [preview.interestOptions],
  );

  const derived = useMemo(
    () =>
      preview.rows.map((row) => {
        const edit = edits[row.key];
        const target = row.candidates.find((c) => c.id === edit.targetId) ?? null;
        const { status, changed } = rowStatus(edit.values, target);
        const attention = rowAttention(edit.values, row, target, changed);
        return { row, edit, target, status, changed, attention };
      }),
    [preview.rows, edits],
  );

  const counts = useMemo(() => {
    const c = { all: derived.length, new: 0, update: 0, unchanged: 0, attention: 0 };
    for (const d of derived) {
      if (d.status === "new") c.new++;
      if (d.status === "update") c.update++;
      if (d.status === "unchanged") c.unchanged++;
      if (d.attention.length || d.status === "invalid") c.attention++;
    }
    return c;
  }, [derived]);

  const toApply = derived.filter(
    (d) => d.edit.include && (d.status === "new" || d.status === "update"),
  );

  const visible = derived.filter((d) => {
    if (filter === "all") return true;
    if (filter === "attention") return d.attention.length > 0 || d.status === "invalid";
    return d.status === filter;
  });

  function update(key: string, patch: Partial<Edit>) {
    setEdits((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }
  function setValue<K extends keyof ImportValues>(key: string, field: K, value: ImportValues[K]) {
    setEdits((prev) => ({
      ...prev,
      [key]: { ...prev[key], values: { ...prev[key].values, [field]: value } },
    }));
  }

  function apply() {
    setError(null);
    startTransition(async () => {
      const result = await applyProspectiveImport({
        fileNames: preview.fileNames,
        rememberColumns,
        rememberInterests,
        rows: toApply.map((d) => ({
          targetId: d.edit.targetId,
          values: d.edit.values,
          unmappedInterests: d.row.unmappedInterests,
        })),
      });
      if (result.ok) onDone(result);
      else setError(result.message);
    });
  }

  const chips: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "new", label: "New" },
    { id: "update", label: "Changes" },
    { id: "unchanged", label: "No change" },
    { id: "attention", label: "Needs attention" },
  ];

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setFilter(c.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === c.id
                ? "bg-forest text-white"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            {c.label} · {counts[c.id]}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Ticked rows are saved when you apply. Edit any field first — a highlighted field is
        different from what&rsquo;s on file now. Students already on file but missing from this
        upload are left alone.
      </p>

      <ul className="mt-4 space-y-3">
        {visible.map(({ row, edit, target, status, changed, attention }) => (
          <li
            key={row.key}
            className={`rounded-lg border p-4 ${
              edit.include
                ? "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950"
                : "border-zinc-200 bg-zinc-50 opacity-75 dark:border-zinc-800 dark:bg-zinc-900"
            }`}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={edit.include}
                  disabled={status === "unchanged" || status === "invalid"}
                  onChange={(e) => update(row.key, { include: e.target.checked })}
                />
                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status].cls}`}>
                  {STATUS_STYLE[status].label}
                </span>
              </label>
              <span className="font-medium">
                {[edit.values.preferredName || edit.values.firstName, edit.values.lastName]
                  .filter(Boolean)
                  .join(" ") || "(no name)"}
              </span>
              <span className="text-xs text-zinc-500">
                {row.fileName} · row {row.rowNumber}
              </span>
              <label className="ml-auto flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                Match to
                <select
                  value={edit.targetId ?? ""}
                  onChange={(e) => update(row.key, { targetId: e.target.value || null })}
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="">Add as new student</option>
                  {row.candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      Update: {c.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {attention.length ? (
              <ul className="mt-2 space-y-0.5 text-xs text-amber-800 dark:text-amber-300">
                {attention.map((a) => (
                  <li key={a}>⚠ {a}</li>
                ))}
              </ul>
            ) : null}

            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
              <TextField label="firstName" rowKey={row.key} edit={edit} target={target} changed={changed} setValue={setValue} />
              <TextField label="lastName" rowKey={row.key} edit={edit} target={target} changed={changed} setValue={setValue} />
              <TextField label="preferredName" rowKey={row.key} edit={edit} target={target} changed={changed} setValue={setValue} />
              <Field name="gender" target={target} changed={changed} was={target?.values.gender ?? "—"}>
                <select
                  value={edit.values.gender ?? ""}
                  onChange={(e) => setValue(row.key, "gender", (e.target.value || null) as ImportValues["gender"])}
                  className={input}
                >
                  <option value="">—</option>
                  <option value="M">M</option>
                  <option value="F">F</option>
                </select>
              </Field>
              <Field name="grade" target={target} changed={changed} was={target?.values.grade?.toString() ?? "—"}>
                <select
                  value={edit.values.grade ?? ""}
                  onChange={(e) => setValue(row.key, "grade", e.target.value ? Number(e.target.value) : null)}
                  className={input}
                >
                  <option value="">—</option>
                  {Array.from({ length: 13 }, (_, g) => (
                    <option key={g} value={g}>
                      {g === 0 ? "K" : g}
                    </option>
                  ))}
                </select>
              </Field>
              <TextField label="currentSchool" rowKey={row.key} edit={edit} target={target} changed={changed} setValue={setValue} />
              <Field name="shadowDate" target={target} changed={changed} was={target?.values.shadowDate || "—"}>
                <input
                  type="date"
                  value={edit.values.shadowDate}
                  onChange={(e) => setValue(row.key, "shadowDate", e.target.value)}
                  className={input}
                />
              </Field>
              <Field name="shadowStart" target={target} changed={changed} was={target?.values.shadowStart || "—"}>
                <input
                  type="time"
                  value={edit.values.shadowStart}
                  onChange={(e) => setValue(row.key, "shadowStart", e.target.value)}
                  className={input}
                />
              </Field>
              <Field name="shadowEnd" target={target} changed={changed} was={target?.values.shadowEnd || "—"}>
                <input
                  type="time"
                  value={edit.values.shadowEnd}
                  onChange={(e) => setValue(row.key, "shadowEnd", e.target.value)}
                  className={input}
                />
              </Field>
            </div>

            <div className="mt-3">
              <div
                className={`text-xs font-medium ${
                  target && changed.includes("interestIds") ? "text-amber-800 dark:text-amber-300" : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                Interests (in priority order)
              </div>
              <div className="mt-0.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: INTEREST_SLOTS }, (_, i) => (
                  <InterestSelect
                    key={i}
                    slot={i}
                    value={edit.values.interestIds[i] ?? null}
                    options={preview.interestOptions}
                    onChange={(id) => {
                      const next = [...edit.values.interestIds];
                      next[i] = id;
                      setValue(row.key, "interestIds", next);
                    }}
                  />
                ))}
              </div>
              {target && changed.includes("interestIds") ? (
                <div className="mt-1 text-xs text-zinc-500">
                  was:{" "}
                  {target.values.interestIds.filter(Boolean).map((id) => interestName.get(id!) ?? "?").join(", ") ||
                    "none"}
                </div>
              ) : null}
            </div>
          </li>
        ))}
        {visible.length === 0 ? (
          <li className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
            Nothing in this view.
          </li>
        ) : null}
      </ul>

      <div
        className="sticky bottom-0 mt-4 flex flex-wrap items-center gap-3 border-t border-zinc-200 bg-white/95 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <button
          type="button"
          onClick={apply}
          disabled={pending || toApply.length === 0}
          className="rounded-md bg-forest px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : `Apply ${toApply.length} change${toApply.length === 1 ? "" : "s"}`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
        >
          Cancel — save nothing
        </button>
        <span className="text-xs text-zinc-500">
          {toApply.filter((d) => d.status === "new").length} new ·{" "}
          {toApply.filter((d) => d.status === "update").length} updated
        </span>
        {error ? <span className="w-full text-sm text-red-700 dark:text-red-400">{error}</span> : null}
      </div>
    </div>
  );
}

function Field({
  name,
  target,
  changed,
  was,
  children,
}: {
  name: keyof typeof FIELD_LABELS;
  target: ExistingCandidate | null;
  changed: string[];
  was: string;
  children: React.ReactNode;
}) {
  const isChanged = !!target && changed.includes(name);
  return (
    <label className={`block text-xs ${isChanged ? "rounded-md bg-amber-50 p-1 dark:bg-amber-950/40" : ""}`}>
      <span className={`font-medium ${isChanged ? "text-amber-800 dark:text-amber-300" : "text-zinc-600 dark:text-zinc-400"}`}>
        {FIELD_LABELS[name]}
      </span>
      {children}
      {isChanged ? <span className="mt-0.5 block text-zinc-500">was: {was}</span> : null}
    </label>
  );
}

function TextField({
  label,
  rowKey,
  edit,
  target,
  changed,
  setValue,
}: {
  label: "firstName" | "lastName" | "preferredName" | "currentSchool";
  rowKey: string;
  edit: Edit;
  target: ExistingCandidate | null;
  changed: string[];
  setValue: <K extends keyof ImportValues>(key: string, field: K, value: ImportValues[K]) => void;
}) {
  return (
    <Field name={label} target={target} changed={changed} was={target?.values[label] || "—"}>
      <input
        type="text"
        value={edit.values[label]}
        onChange={(e) => setValue(rowKey, label, e.target.value)}
        className={input}
      />
    </Field>
  );
}

function InterestSelect({
  slot,
  value,
  options,
  onChange,
}: {
  slot: number;
  value: string | null;
  options: InterestOption[];
  onChange: (id: string | null) => void;
}) {
  // Inactive interests stay pickable only if already selected, so an old
  // record still shows what it has instead of a silent blank.
  const shown = options.filter((o) => o.active || o.id === value);
  const groups = new Map<string, InterestOption[]>();
  for (const o of shown) groups.set(o.category, [...(groups.get(o.category) ?? []), o]);
  return (
    <select
      aria-label={`Interest ${slot + 1}`}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={input}
    >
      <option value="">{slot + 1}. —</option>
      {[...groups.entries()].map(([cat, opts]) => (
        <optgroup key={cat} label={cat}>
          {opts.map((o) => (
            <option key={o.id} value={o.id}>
              {slot + 1}. {o.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
