"use client";

// The host's own details page. Was `interests-form.tsx`; it now owns the
// page heading and the save control as well as the fields, because the save
// button has to sit outside the <form> element (the schedule box, which is
// its own form, renders between them) and its enabled state depends on what
// is typed into the fields.
//
// The button lives in a sticky bar at the top right. That is the point of
// this component: the form is one short row of fields followed by roughly 48
// interest checkboxes, and the save button used to be underneath all of
// them. A student who filled everything in and did not scroll back down saw
// nothing that looked like "done" — which is a plausible contributor to the
// host records that have a name and nothing else.

import { useRef, useState } from "react";
import { useActionState } from "react";
import { saveMe, type SaveState } from "./actions";

type Interest = { id: string; name: string };

const initial: SaveState = { ok: false, message: "" };

const FORM_ID = "me-profile-form";

function missingFrom(grade: unknown, gender: unknown, interestCount: number): string[] {
  const missing: string[] = [];
  const g = Number(grade);
  if (!grade || !Number.isFinite(g) || g < 1 || g > 12) missing.push("your grade");
  if (gender !== "M" && gender !== "F") missing.push("male or female");
  if (interestCount === 0) missing.push("at least one interest");
  return missing;
}

function CheckGroup({
  title,
  items,
  selectedIds,
}: {
  title: string;
  items: Interest[];
  selectedIds: string[];
}) {
  return (
    <fieldset className="mt-6">
      <legend className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
      </legend>
      <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {items.map((i) => (
          <label key={i.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="interestIds"
              value={i.id}
              defaultChecked={selectedIds.includes(i.id)}
              className="h-4 w-4 rounded border-zinc-300"
            />
            <span>{i.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function ProfileForm({
  host,
  groups,
  selectedIds,
  hasSchedule,
  children,
}: {
  host: { grade: number | null; gender: "M" | "F" | null };
  groups: { label: string; items: Interest[] }[];
  selectedIds: string[];
  hasSchedule: boolean;
  /** The schedule box, rendered on the server and slotted in between the
   *  sticky header and the fields. */
  children: React.ReactNode;
}) {
  const [state, action, pending] = useActionState(saveMe, initial);
  const formRef = useRef<HTMLFormElement>(null);

  // Seeded from props rather than read from the DOM in an effect, so the
  // button is in the right state on the very first paint.
  const [missing, setMissing] = useState<string[]>(() =>
    missingFrom(host.grade ?? "", host.gender ?? "", selectedIds.length),
  );

  function recompute() {
    const f = formRef.current;
    if (!f) return;
    const fd = new FormData(f);
    setMissing(
      missingFrom(fd.get("grade"), fd.get("gender"), fd.getAll("interestIds").length),
    );
  }

  const complete = missing.length === 0;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    // The button is disabled while anything is missing, so this only catches
    // a submit that got through another way (Enter in a text field). The
    // server validates independently regardless.
    const fd = new FormData(e.currentTarget);
    if (missingFrom(fd.get("grade"), fd.get("gender"), fd.getAll("interestIds").length).length) {
      e.preventDefault();
      recompute();
      return;
    }
    if (hasSchedule) return;
    // Kept deliberately: this prompt is the main thing pushing students to
    // add a calendar link, and most of those who never add one stop here.
    const proceed = window.confirm(
      "You haven't added your class schedule link yet. It really helps us match you with visitors " +
        "who share your interests — use the “Help me find this” link above if you're not " +
        "sure where to find it.\n\nYou can still save now and add it later. Continue without it?",
    );
    if (!proceed) e.preventDefault();
  }

  return (
    <>
      <div className="sticky top-0 z-20 -mx-6 mb-2 border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">My info</h1>
            <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
              So we can match you with the right shadow visitors.
            </p>
          </div>

          <div className="flex flex-col items-end gap-1">
            <button
              type="submit"
              form={FORM_ID}
              disabled={!complete || pending}
              className="rounded-md bg-forest px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-forest/90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-forest dark:text-white"
            >
              {pending ? "Saving…" : "Save info"}
            </button>
            {/* One line, naming exactly what is still missing — "Save is
                disabled" with no reason is the version people get stuck on. */}
            {!complete ? (
              <span className="text-xs text-zinc-600 dark:text-zinc-400">
                Still needed: {missing.join(", ")}
              </span>
            ) : state.message ? (
              <span
                className={
                  state.ok
                    ? "text-xs font-medium text-green-700 dark:text-green-400"
                    : "text-xs font-medium text-red-700 dark:text-red-400"
                }
              >
                {state.message}
              </span>
            ) : (
              <span className="text-xs text-zinc-500">Ready to save</span>
            )}
          </div>
        </div>
      </div>

      {children}

      <form
        id={FORM_ID}
        ref={formRef}
        action={action}
        onSubmit={handleSubmit}
        onChange={recompute}
        className="mt-10 border-t border-zinc-200 pt-6 dark:border-zinc-800"
      >
        <div className="flex flex-wrap gap-6">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">
              Grade <span className="text-red-600">*</span>
            </span>
            <input
              name="grade"
              type="number"
              min={1}
              max={12}
              required
              defaultValue={host.grade ?? ""}
              className="w-24 rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium">
              Gender <span className="text-red-600">*</span>
            </span>
            <div className="flex gap-4 py-2">
              {(["M", "F"] as const).map((g) => (
                <label key={g} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="gender"
                    value={g}
                    required
                    defaultChecked={host.gender === g}
                  />
                  <span>{g === "M" ? "Male" : "Female"}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-6 text-sm text-zinc-500">
          Select at least one interest <span className="text-red-600">*</span>
        </p>
        {groups.map((g) => (
          <CheckGroup
            key={g.label}
            title={g.label}
            items={g.items}
            selectedIds={selectedIds}
          />
        ))}

        {/* No second save button down here on purpose — the sticky one above
            is always on screen, and two buttons with the same job invites
            the question of whether they do different things. */}
        <p className="mt-8 text-sm text-zinc-500">
          {complete
            ? "Use Save info at the top of the page when you're done."
            : `Still needed: ${missing.join(", ")}.`}
        </p>
      </form>
    </>
  );
}
