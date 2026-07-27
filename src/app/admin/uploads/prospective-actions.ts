"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  prospectiveStudents,
  prospectiveInterests,
  interests,
  matchFlags,
  importBatches,
} from "@/lib/db/schema";
import { extractTokens } from "@/lib/schedule/extract";
import { parseInterviewVisitForm } from "@/lib/finalsite/parse-form-pdf";

export type ProspectiveUploadResult = {
  ok: boolean;
  message: string;
  perFile: { fileName: string; status: string }[];
};

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function uploadProspectiveForms(
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

  // Interest name → id lookup (normalized).
  const allInterests = await db.select().from(interests);
  const interestByName = new Map(allInterests.map((i) => [norm(i.name), i.id]));

  const [batch] = await db
    .insert(importBatches)
    .values({
      kind: "prospective",
      fileName: files.length === 1 ? files[0].name : `${files.length} files`,
      rowCount: files.length,
      uploadedBy: admin.id,
    })
    .returning({ id: importBatches.id });

  const perFile: { fileName: string; status: string }[] = [];

  for (const file of files) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const tokens = await extractTokens(bytes);
      const parsed = parseInterviewVisitForm(tokens);

      if (!parsed.studentName) {
        perFile.push({
          fileName: file.name,
          status: `Skipped — ${parsed.warnings.join("; ") || "no student name"}`,
        });
        continue;
      }

      const [prospective] = await db
        .insert(prospectiveStudents)
        .values({
          firstName: parsed.firstName,
          lastName: parsed.lastName,
          fullName: parsed.studentName,
          grade: parsed.grade,
          gender: parsed.gender,
          currentSchool: parsed.currentSchool,
          shadowDate: parsed.shadowDate,
          wantsShadow: parsed.wantsShadow,
          scheduleChoice: parsed.scheduleChoice,
          interviewDate: parsed.interviewDate,
          interviewStart: parsed.interviewStart,
          interviewEnd: parsed.interviewEnd,
          additionalInfo: parsed.additionalInfo,
          familyEmail: parsed.familyEmail,
          importBatchId: batch.id,
        })
        .returning({ id: prospectiveStudents.id });

      // Map interests. Academic interest gets priority 0 (weighted highest for
      // the interest→class match); the 4 activity interests keep their rank.
      const wanted: { name: string; priority: number }[] = [];
      if (parsed.academicInterest)
        wanted.push({ name: parsed.academicInterest, priority: 0 });
      for (const i of parsed.interests) {
        if (i.name) wanted.push({ name: i.name, priority: i.rank });
      }

      const unmapped: string[] = [];
      const seenInterest = new Set<string>();
      for (const w of wanted) {
        const id = interestByName.get(norm(w.name));
        if (!id) {
          unmapped.push(w.name);
          continue;
        }
        if (seenInterest.has(id)) continue; // avoid dup interestId
        seenInterest.add(id);
        await db
          .insert(prospectiveInterests)
          .values({ prospectiveId: prospective.id, interestId: id, priority: w.priority })
          .onConflictDoNothing();
      }

      if (unmapped.length) {
        await db.insert(matchFlags).values({
          prospectiveId: prospective.id,
          type: "uncovered_interest",
          message: `Unrecognized interest(s) — add to Interests or rename: ${unmapped.join(", ")}`,
        });
      }
      if (parsed.wantsShadow && !parsed.shadowDate) {
        await db.insert(matchFlags).values({
          prospectiveId: prospective.id,
          type: "no_availability",
          message: "Chose a shadow visit but no shadow date was read from the form.",
        });
      }

      const bits = [
        `${parsed.studentName} · grade ${parsed.grade ?? "?"} · ${parsed.gender ?? "?"}`,
        parsed.wantsShadow ? `shadow ${parsed.shadowDate ?? "(no date)"}` : "interview only",
        unmapped.length ? `⚠ ${unmapped.length} unmapped` : `${seenInterest.size} interests`,
      ];
      perFile.push({ fileName: file.name, status: bits.join(" · ") });
    } catch (e) {
      perFile.push({
        fileName: file.name,
        status: `Error: ${e instanceof Error ? e.message : "parse failed"}`,
      });
    }
  }

  revalidatePath("/admin/uploads");
  revalidatePath("/admin");
  revalidatePath("/admin/match");
  return { ok: true, message: `Processed ${files.length} file(s).`, perFile };
}
