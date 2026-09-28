"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  prospectiveStudents,
  prospectiveInterests,
  interests,
  matchFlags,
  importBatches,
} from "@/lib/db/schema";
import { parseProspectiveReportRows } from "@/lib/finalsite/parse-prospective-report";

export type ProspectiveUploadResult = {
  ok: boolean;
  message: string;
  perFile: { fileName: string; status: string }[];
};

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// Bulk FinalSite report (.xlsx): one row per prospective student, covering
// many students in a single upload — see parse-prospective-report.ts for the
// column shape and the (level, name) interest-pair quirk.
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
export async function uploadProspectiveReport(
  _prev: ProspectiveUploadResult | undefined,
  formData: FormData,
): Promise<ProspectiveUploadResult> {
  const admin = await requireAdmin();
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return { ok: false, message: "No files selected.", perFile: [] };
  }

  const allInterests = await db.select().from(interests);
  const interestByName = new Map(allInterests.map((i) => [norm(i.name), i.id]));

  // Existing prospectives, keyed by name+grade (the best available stable-ish
  // key — the report has no external/FinalSite id column mapped). Re-
  // uploading a growing roster updates whoever's already on file instead of
  // creating a duplicate row for them; nothing already in the database is
  // ever deleted, and anyone not matched here is simply inserted as new.
  const existingProspectives = await db
    .select({
      id: prospectiveStudents.id,
      firstName: prospectiveStudents.firstName,
      lastName: prospectiveStudents.lastName,
      grade: prospectiveStudents.grade,
    })
    .from(prospectiveStudents);
  const existingIdByKey = new Map<string, string>(
    existingProspectives.map((p) => [
      `${norm(p.firstName ?? "")}|${norm(p.lastName ?? "")}|${p.grade ?? ""}`,
      p.id,
    ]),
  );

  const perFile: { fileName: string; status: string }[] = [];
  let totalImported = 0;
  let totalUpdated = 0;

  for (const file of files) {
    try {
      const bytes = await file.arrayBuffer();
      const workbook = XLSX.read(bytes, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
        header: 1,
        defval: null,
        raw: false,
      });
      const { rows: parsedRows, warnings: reportWarnings, notes: reportNotes } =
        parseProspectiveReportRows(rows);

      if (reportWarnings.length) {
        perFile.push({
          fileName: file.name,
          status: `Skipped — ${reportWarnings.join("; ")}`,
        });
        continue;
      }

      const [batch] = await db
        .insert(importBatches)
        .values({
          kind: "prospective",
          fileName: file.name,
          rowCount: parsedRows.length,
          uploadedBy: admin.id,
        })
        .returning({ id: importBatches.id });

      let imported = 0;
      let updated = 0;
      let skipped = 0;
      let unmappedTotal = 0;
      let missingGender = 0;

      for (const row of parsedRows) {
        if (!row.fullName) {
          skipped++;
          continue;
        }
        if (!row.gender) missingGender++;

        const key = `${norm(row.firstName ?? "")}|${norm(row.lastName ?? "")}|${row.grade ?? ""}`;
        const existingId = existingIdByKey.get(key);
        const values = {
          firstName: row.firstName,
          lastName: row.lastName,
          fullName: row.fullName,
          grade: row.grade,
          gender: row.gender,
          currentSchool: row.currentSchool,
          shadowDate: row.visitDate,
          shadowStart: row.visitStart,
          shadowEnd: row.visitEnd,
          wantsShadow: true,
          importBatchId: batch.id,
        };

        let prospectiveId: string;
        if (existingId) {
          await db.update(prospectiveStudents).set(values).where(eq(prospectiveStudents.id, existingId));
          prospectiveId = existingId;
          updated++;
          // Replace this prospective's interests/flags with the latest read
          // rather than layering duplicates on top of a prior upload.
          await db.delete(prospectiveInterests).where(eq(prospectiveInterests.prospectiveId, prospectiveId));
          await db.delete(matchFlags).where(eq(matchFlags.prospectiveId, prospectiveId));
        } else {
          const [created] = await db
            .insert(prospectiveStudents)
            .values(values)
            .returning({ id: prospectiveStudents.id });
          prospectiveId = created.id;
          existingIdByKey.set(key, prospectiveId);
          imported++;
        }

        const unmapped: string[] = [];
        const seenInterest = new Set<string>();
        for (const pick of row.interests) {
          const id = interestByName.get(norm(pick.name));
          if (!id) {
            unmapped.push(pick.name);
            continue;
          }
          if (seenInterest.has(id)) continue;
          seenInterest.add(id);
          await db
            .insert(prospectiveInterests)
            .values({ prospectiveId, interestId: id, priority: pick.priority })
            .onConflictDoNothing();
        }

        if (unmapped.length) {
          unmappedTotal += unmapped.length;
          await db.insert(matchFlags).values({
            prospectiveId,
            type: "uncovered_interest",
            message: `Unrecognized interest(s) — add to Interests or rename: ${unmapped.join(", ")}`,
          });
        }
        if (!row.visitDate) {
          await db.insert(matchFlags).values({
            prospectiveId,
            type: "no_availability",
            message: "No visit date could be read from the report row.",
          });
        }
      }

      totalImported += imported;
      totalUpdated += updated;
      const bits = [
        `${imported} new`,
        updated ? `${updated} updated (already on file)` : null,
        skipped ? `${skipped} skipped (no name)` : null,
        unmappedTotal ? `⚠ ${unmappedTotal} unmapped interest(s)` : null,
        missingGender ? `⚠ ${missingGender} missing gender — fill in manually` : null,
        ...reportNotes.map((n) => `ℹ ${n}`),
      ].filter(Boolean);
      perFile.push({ fileName: file.name, status: bits.join(" · ") });
    } catch (e) {
      perFile.push({
        fileName: file.name,
        status: `Error: ${e instanceof Error ? e.message : "parse failed"}`,
      });
    }
  }

  revalidatePath("/admin/prospectives/upload");
  revalidatePath("/admin/prospectives");
  revalidatePath("/admin");
  revalidatePath("/admin/match");
  return {
    ok: true,
    message: `Processed ${files.length} file(s) — ${totalImported} new, ${totalUpdated} updated.`,
    perFile,
  };
}
