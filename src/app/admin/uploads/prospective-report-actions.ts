"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  prospectiveStudents,
  prospectiveInterests,
  interests,
  matches,
  matchFlags,
  importBatches,
} from "@/lib/db/schema";
import {
  parseProspectiveReportRows,
  REPORT_FIELDS,
  type ColumnOverrides,
  type ReportFieldKey,
} from "@/lib/finalsite/parse-prospective-report";
import { getSavedColumns, saveColumns } from "@/lib/finalsite/column-mapping";
import { isSupportedReportFile, readReportFile } from "@/lib/finalsite/read-report-file";
import {
  INTEREST_SLOTS,
  NOT_IN_FILE,
  composeFullName,
  nameKey,
  normName,
  pickDefaultTarget,
  rowStatus,
  type ExistingCandidate,
  type ImportValues,
  type InterestOption,
  type PreviewRow,
} from "@/lib/finalsite/prospective-import";

// Bulk FinalSite report (.xlsx/.xls): one row per prospective student. Two
// steps, so nothing reaches the database until an admin has seen it:
//
//   1. previewProspectiveReport — parses the file(s) and matches every row to
//      an existing prospective by first + last name. Writes nothing.
//   2. applyProspectiveImport — receives the rows the admin kept, with any
//      edits they made, and writes them in one transaction.
//
// Matching is by name, deliberately *not* name + grade: the old key included
// grade, so correcting a student's grade in FinalSite and re-uploading made a
// second record instead of updating the first. Grade only breaks ties when
// several existing records share a name, and the admin can override the pick.
//
// Deliberately kept in its own file, free of any PDF-parsing import. This
// used to share a file (prospective-actions.ts) with the old PDF "Interview
// and Visit Form" upload action — merely invoking *this* export from a
// Server Action still forced Next.js to load that file's other top-level
// imports (extract.ts, which pulls in pdfjs-dist), which crashes at import
// time on Vercel (`DOMMatrix is not defined` — pdfjs-dist needs a native
// canvas package that isn't installed here). That PDF path was already
// unreachable from any page (see README item history), so it's been deleted
// outright rather than worked around.

export type ProspectivePreviewResult = {
  ok: boolean;
  previewId: string; // new per upload, so the review table resets on re-upload
  message: string;
  perFile: { fileName: string; status: string }[];
  rows: PreviewRow[];
  interestOptions: InterestOption[];
  fileNames: string[];
  mapping: ColumnMappingView | null; // from the first readable file
};

// What the review screen's column-mapping panel shows: for every platform
// field, the file column it was read from and why, plus the columns nobody
// used. `chosen` is what this upload's form picked ("" = automatic), echoed
// back so the panel's selects keep their state and Apply can remember them.
export type ColumnMappingView = {
  fileName: string;
  headers: string[];
  unusedHeaders: string[];
  fields: {
    field: ReportFieldKey;
    label: string;
    required: boolean;
    header: string | null;
    source: "chosen" | "saved" | "exact" | "fuzzy" | null;
    savedHeader: string | null;
    chosen: string; // "" automatic · "__none__" not in file · otherwise a header
  }[];
};

function hhmm(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : "";
}

// fullName isn't split into its parts on the row, so recover the preferred
// name the same way it was composed: fullName = (preferred || first) + last.
function derivePreferred(first: string, last: string, full: string): string {
  const composed = [first, last].filter(Boolean).join(" ");
  if (!full || full === composed) return "";
  const lead = last && full.endsWith(` ${last}`) ? full.slice(0, -last.length - 1).trim() : "";
  return lead && lead !== first ? lead : "";
}

function fmtShortDate(d: string | null): string {
  if (!d) return "no date";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export async function previewProspectiveReport(
  _prev: ProspectivePreviewResult | undefined,
  formData: FormData,
): Promise<ProspectivePreviewResult> {
  await requireAdmin();
  const previewId = crypto.randomUUID();
  const empty = { previewId, rows: [], interestOptions: [], fileNames: [], mapping: null };
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return { ok: false, message: "No files selected.", perFile: [], ...empty };
  }

  let allInterests: (typeof interests.$inferSelect)[];
  let existing: (typeof prospectiveStudents.$inferSelect)[];
  let existingInterests: { prospectiveId: string; interestId: string; priority: number }[];
  let matched: { prospectiveId: string }[];
  try {
    [allInterests, existing, existingInterests, matched] = await Promise.all([
      db.select().from(interests),
      db.select().from(prospectiveStudents),
      db
        .select({
          prospectiveId: prospectiveInterests.prospectiveId,
          interestId: prospectiveInterests.interestId,
          priority: prospectiveInterests.priority,
        })
        .from(prospectiveInterests),
      db.selectDistinct({ prospectiveId: matches.prospectiveId }).from(matches),
    ]);
  } catch (err) {
    console.error("previewProspectiveReport: failed to load existing data", err);
    return { ok: false, message: "Couldn't load existing students — try again.", perFile: [], ...empty };
  }

  // Column choices: remembered ones first, then this upload's picks on top.
  let saved: Partial<Record<ReportFieldKey, string>> = {};
  try {
    saved = await getSavedColumns();
  } catch (err) {
    console.error("previewProspectiveReport: couldn't load saved columns", err);
  }
  const chosen: Partial<Record<ReportFieldKey, string>> = {};
  const overrides: ColumnOverrides = { ...saved };
  for (const f of REPORT_FIELDS) {
    const v = formData.get(`map:${f.key}`);
    if (typeof v !== "string" || v === "") continue;
    chosen[f.key] = v;
    overrides[f.key] = v === NOT_IN_FILE ? null : v;
  }
  let mapping: ColumnMappingView | null = null;

  const interestByName = new Map(allInterests.map((i) => [normName(i.name), i.id]));
  const withMatches = new Set(matched.map((m) => m.prospectiveId));
  const interestsByProspective = new Map<string, (string | null)[]>();
  for (const pi of existingInterests) {
    const slots = interestsByProspective.get(pi.prospectiveId) ?? Array(INTEREST_SLOTS).fill(null);
    if (pi.priority >= 1 && pi.priority <= INTEREST_SLOTS) slots[pi.priority - 1] = pi.interestId;
    interestsByProspective.set(pi.prospectiveId, slots);
  }

  const candidatesByName = new Map<string, ExistingCandidate[]>();
  for (const p of existing) {
    const first = p.firstName ?? "";
    const last = p.lastName ?? "";
    const values: ImportValues = {
      firstName: first,
      lastName: last,
      preferredName: derivePreferred(first, last, p.fullName),
      gender: p.gender,
      grade: p.grade,
      currentSchool: p.currentSchool ?? "",
      shadowDate: p.shadowDate ?? "",
      shadowStart: hhmm(p.shadowStart),
      shadowEnd: hhmm(p.shadowEnd),
      // Compact to the order the slots were filled, matching how parsed rows
      // are built — otherwise a gap in stored priorities reads as a change.
      interestIds: compactSlots(interestsByProspective.get(p.id) ?? []),
    };
    const key = nameKey(first, last);
    const list = candidatesByName.get(key) ?? [];
    list.push({
      id: p.id,
      label: `${p.fullName} · grade ${p.grade ?? "?"} · ${fmtShortDate(p.shadowDate)}`,
      values,
      hasMatches: withMatches.has(p.id),
    });
    candidatesByName.set(key, list);
  }

  const perFile: { fileName: string; status: string }[] = [];
  const rows: PreviewRow[] = [];
  const seenInUpload = new Set<string>();

  for (const file of files) {
    try {
      if (!isSupportedReportFile(file.name)) {
        perFile.push({ fileName: file.name, status: "Skipped — use a .xlsx, .xls or .csv file." });
        continue;
      }
      const raw = readReportFile(await file.arrayBuffer(), file.name);
      const parsed = parseProspectiveReportRows(raw, overrides);
      if (!mapping && parsed.headers.length) {
        const used = new Set(parsed.columns.map((c) => c.header).filter(Boolean));
        mapping = {
          fileName: file.name,
          headers: parsed.headers,
          unusedHeaders: parsed.headers.filter((h) => !used.has(h)),
          fields: REPORT_FIELDS.map((f) => {
            const col = parsed.columns.find((c) => c.field === f.key)!;
            return {
              field: f.key,
              label: f.label,
              required: f.required,
              header: col.header,
              source:
                col.source === "override" ? (f.key in chosen ? "chosen" : "saved") : col.source,
              savedHeader: saved[f.key] ?? null,
              chosen: chosen[f.key] ?? "",
            };
          }),
        };
      }
      if (parsed.warnings.length) {
        perFile.push({ fileName: file.name, status: `Skipped — ${parsed.warnings.join("; ")}` });
        continue;
      }

      parsed.rows.forEach((r, idx) => {
        const unmapped: string[] = [];
        const ids: string[] = [];
        for (const pick of r.interests) {
          const id = interestByName.get(normName(pick.name));
          if (!id) unmapped.push(pick.name);
          else if (!ids.includes(id)) ids.push(id);
        }
        const values: ImportValues = {
          firstName: r.firstName ?? "",
          lastName: r.lastName ?? "",
          preferredName: r.preferredName ?? "",
          gender: r.gender,
          grade: r.grade,
          currentSchool: r.currentSchool ?? "",
          shadowDate: r.visitDate ?? "",
          shadowStart: hhmm(r.visitStart),
          shadowEnd: hhmm(r.visitEnd),
          interestIds: compactSlots(ids),
        };
        const key = nameKey(values.firstName, values.lastName);
        const candidates = candidatesByName.get(key) ?? [];
        rows.push({
          key: `${file.name}#${idx}`,
          fileName: file.name,
          rowNumber: idx + 2,
          parsed: values,
          unmappedInterests: unmapped,
          parseWarnings: r.warnings,
          candidates,
          defaultTargetId: pickDefaultTarget(values, candidates),
          duplicateInFile: seenInUpload.has(key),
        });
        seenInUpload.add(key);
      });

      perFile.push({
        fileName: file.name,
        status: [`${parsed.rows.length} row(s) read`, ...parsed.notes.map((n) => `ℹ ${n}`)].join(" · "),
      });
    } catch (e) {
      perFile.push({
        fileName: file.name,
        status: `Error: ${e instanceof Error ? e.message : "parse failed"}`,
      });
    }
  }

  const counts = { new: 0, update: 0, unchanged: 0, invalid: 0 };
  for (const r of rows) {
    const target = r.candidates.find((c) => c.id === r.defaultTargetId) ?? null;
    counts[rowStatus(r.parsed, target).status]++;
  }

  return {
    ok: rows.length > 0,
    previewId,
    mapping,
    message: rows.length
      ? `Nothing saved yet. ${counts.new} new, ${counts.update} with changes, ${counts.unchanged} unchanged — review below, then apply.`
      : "No rows could be read from the upload.",
    perFile,
    rows,
    interestOptions: allInterests
      .map((i) => ({ id: i.id, name: i.name, category: i.category, active: i.active }))
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
    fileNames: files.map((f) => f.name),
  };
}

function compactSlots(ids: (string | null)[]): (string | null)[] {
  const kept = ids.filter((x): x is string => !!x).slice(0, INTEREST_SLOTS);
  return [...kept, ...Array(INTEREST_SLOTS - kept.length).fill(null)];
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

const valuesSchema = z.object({
  firstName: z.string().max(200),
  lastName: z.string().max(200),
  preferredName: z.string().max(200),
  gender: z.enum(["M", "F"]).nullable(),
  grade: z.number().int().min(0).max(12).nullable(),
  currentSchool: z.string().max(300),
  shadowDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  shadowStart: z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/)]),
  shadowEnd: z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/)]),
  interestIds: z.array(z.string().uuid().nullable()).max(INTEREST_SLOTS),
});

const applySchema = z.object({
  fileNames: z.array(z.string().max(300)).max(20),
  // Column picks to remember for future uploads (null = forget the saved one).
  rememberColumns: z
    .partialRecord(
      z.enum(REPORT_FIELDS.map((f) => f.key) as [ReportFieldKey, ...ReportFieldKey[]]),
      z.string().max(300).nullable(),
    )
    .nullable(),
  rows: z
    .array(
      z.object({
        targetId: z.string().uuid().nullable(),
        values: valuesSchema,
        unmappedInterests: z.array(z.string().max(200)).max(INTEREST_SLOTS),
      }),
    )
    .max(2000),
});

export type ApplyImportInput = z.infer<typeof applySchema>;
export type ApplyImportResult = { ok: boolean; message: string };

export async function applyProspectiveImport(input: ApplyImportInput): Promise<ApplyImportResult> {
  const admin = await requireAdmin();
  const parsed = applySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: `Couldn't apply — invalid data: ${parsed.error.issues[0]?.message ?? "unknown"}` };
  }
  const { rows, fileNames, rememberColumns } = parsed.data;
  if (rows.length === 0) return { ok: false, message: "No changes selected." };

  for (const r of rows) {
    if (!r.values.firstName.trim() && !r.values.lastName.trim()) {
      return { ok: false, message: "Every included row needs a first or last name." };
    }
  }

  const targetIds = [...new Set(rows.map((r) => r.targetId).filter((x): x is string => !!x))];
  if (targetIds.length !== rows.filter((r) => r.targetId).length) {
    return { ok: false, message: "Two rows are set to update the same existing student — pick one, or add the other as new." };
  }

  try {
    const result = await db.transaction(async (tx) => {
      // The preview was built from a snapshot; anyone deleted since then
      // can't be updated, and silently re-creating them would surprise.
      if (targetIds.length) {
        const stillThere = await tx
          .select({ id: prospectiveStudents.id })
          .from(prospectiveStudents)
          .where(inArray(prospectiveStudents.id, targetIds));
        if (stillThere.length !== targetIds.length) {
          throw new ApplyError(
            "Some students in this preview were deleted since it was made — upload the file again.",
          );
        }
      }

      const knownInterestIds = new Set(
        (await tx.select({ id: interests.id }).from(interests)).map((i) => i.id),
      );

      const [batch] = await tx
        .insert(importBatches)
        .values({
          kind: "prospective",
          fileName: fileNames.join(", ").slice(0, 300) || "upload",
          rowCount: rows.length,
          uploadedBy: admin.id,
        })
        .returning({ id: importBatches.id });

      const interestRows: { prospectiveId: string; interestId: string; priority: number }[] = [];
      const flagRows: { prospectiveId: string; type: "uncovered_interest" | "no_availability"; message: string }[] = [];
      const newRows: (typeof prospectiveStudents.$inferInsert)[] = [];
      let updated = 0;

      for (const r of rows) {
        const v = r.values;
        const id = r.targetId ?? crypto.randomUUID();
        const record = {
          firstName: v.firstName.trim() || null,
          lastName: v.lastName.trim() || null,
          fullName: composeFullName(v),
          grade: v.grade,
          gender: v.gender,
          currentSchool: v.currentSchool.trim() || null,
          shadowDate: v.shadowDate || null,
          shadowStart: v.shadowStart ? `${v.shadowStart}:00` : null,
          shadowEnd: v.shadowEnd ? `${v.shadowEnd}:00` : null,
          wantsShadow: true,
          importBatchId: batch.id,
        };
        if (r.targetId) {
          await tx.update(prospectiveStudents).set(record).where(eq(prospectiveStudents.id, id));
          updated++;
        } else {
          newRows.push({ id, ...record });
        }

        // Duplicates dropped and priorities renumbered 1..n, so a blank or
        // repeated slot in the editor can't trip the unique indexes.
        const ids = [...new Set(v.interestIds.filter((x): x is string => !!x && knownInterestIds.has(x)))];
        ids.forEach((interestId, i) => interestRows.push({ prospectiveId: id, interestId, priority: i + 1 }));

        if (r.unmappedInterests.length) {
          flagRows.push({
            prospectiveId: id,
            type: "uncovered_interest",
            message: `Unrecognized interest(s) — add to Interests or rename: ${r.unmappedInterests.join(", ")}`,
          });
        }
        if (!v.shadowDate) {
          flagRows.push({ prospectiveId: id, type: "no_availability", message: "No visit date on file." });
        }
      }

      if (newRows.length) await tx.insert(prospectiveStudents).values(newRows);
      if (targetIds.length) {
        // Replace, not layer: the upload is the source of truth for these.
        // Only the importer creates prospective-level flags, so clearing
        // them here can't drop anything matching produced.
        await tx.delete(prospectiveInterests).where(inArray(prospectiveInterests.prospectiveId, targetIds));
        await tx.delete(matchFlags).where(inArray(matchFlags.prospectiveId, targetIds));
      }
      if (interestRows.length) await tx.insert(prospectiveInterests).values(interestRows);
      if (flagRows.length) await tx.insert(matchFlags).values(flagRows);
      if (rememberColumns && Object.keys(rememberColumns).length) {
        await saveColumns(rememberColumns, tx);
      }

      return { created: newRows.length, updated };
    });

    revalidatePath("/admin/prospectives/upload");
    revalidatePath("/admin/prospectives");
    revalidatePath("/admin");
    revalidatePath("/admin/match");
    return {
      ok: true,
      message:
        `Saved — ${result.created} added, ${result.updated} updated.` +
        (rememberColumns && Object.keys(rememberColumns).length
          ? " Column choices remembered for future uploads."
          : ""),
    };
  } catch (err) {
    if (err instanceof ApplyError) return { ok: false, message: err.message };
    console.error("applyProspectiveImport failed", err);
    return { ok: false, message: "Saving failed and nothing was changed — try again." };
  }
}

class ApplyError extends Error {}

export type DeleteBatchResult = { ok: boolean; message: string };

// Deletes an upload batch and every prospective student still associated
// with it (a student who's since been touched by a *later* re-upload — see
// the dedup logic above — has already moved to that batch's id, so this
// only removes whoever this specific batch is still the most recent source
// for). prospectiveStudents.importBatchId itself is ON DELETE SET NULL, so
// deleting the batch row alone would silently orphan the reference instead
// of removing the students — deleting the students first, explicitly, is
// what actually does the "undo this upload" the admin is asking for. Their
// interests/flags/matches cascade automatically from the prospective row's
// own FK (ON DELETE CASCADE).
export async function deleteImportBatch(
  _prev: DeleteBatchResult | undefined,
  formData: FormData,
): Promise<DeleteBatchResult> {
  await requireAdmin();
  const batchId = formData.get("batchId");
  if (typeof batchId !== "string") {
    return { ok: false, message: "Missing batch id." };
  }

  const removedStudents = await db
    .delete(prospectiveStudents)
    .where(eq(prospectiveStudents.importBatchId, batchId))
    .returning({ id: prospectiveStudents.id });
  await db.delete(importBatches).where(eq(importBatches.id, batchId));

  revalidatePath("/admin/prospectives/upload");
  revalidatePath("/admin/prospectives");
  revalidatePath("/admin");
  revalidatePath("/admin/match");

  return {
    ok: true,
    message: `Deleted the upload and ${removedStudents.length} associated student(s).`,
  };
}
