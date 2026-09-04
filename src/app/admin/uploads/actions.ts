"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  hostStudents,
  hostScheduleDays,
  hostScheduleBlocks,
  importBatches,
} from "@/lib/db/schema";
import { parseHostScheduleCsv } from "@/lib/schedule/parse-host-csv";
import { composeName } from "@/lib/names";
import { and, eq } from "drizzle-orm";

export type UploadResult = {
  ok: boolean;
  message: string;
  perFile: { fileName: string; status: string }[];
};

// Match a CSV to an existing host by name, else create one.
async function upsertHost(firstName: string | null, lastName: string | null, grade: number | null) {
  const fullName = composeName(firstName, lastName) || "(unknown)";
  const [existing] = await db
    .select()
    .from(hostStudents)
    .where(eq(hostStudents.fullName, fullName))
    .limit(1);
  if (existing) {
    // Backfill grade if we learned it from the schedule.
    if (grade !== null && existing.grade === null) {
      await db.update(hostStudents).set({ grade }).where(eq(hostStudents.id, existing.id));
    }
    return existing.id;
  }
  const [created] = await db
    .insert(hostStudents)
    .values({ firstName, lastName, fullName, grade })
    .returning({ id: hostStudents.id });
  return created.id;
}

export async function uploadHostSchedules(
  _prev: UploadResult | undefined,
  formData: FormData,
): Promise<UploadResult> {
  const admin = await requireAdmin();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return { ok: false, message: "No files selected.", perFile: [] };
  }

  const [batch] = await db
    .insert(importBatches)
    .values({
      kind: "host_schedule",
      fileName: files.length === 1 ? files[0].name : `${files.length} files`,
      rowCount: files.length,
      uploadedBy: admin.id,
    })
    .returning({ id: importBatches.id });

  const perFile: { fileName: string; status: string }[] = [];

  for (const file of files) {
    try {
      const text = await file.text();
      const parsed = parseHostScheduleCsv(text);
      if (!parsed.studentName || !parsed.date) {
        perFile.push({
          fileName: file.name,
          status: `Skipped — ${parsed.warnings.join("; ") || "missing student or date"}`,
        });
        continue;
      }

      const hostId = await upsertHost(parsed.firstName, parsed.lastName, parsed.grade);

      // Replace any existing schedule for this host+date.
      const existingDay = await db
        .select({ id: hostScheduleDays.id })
        .from(hostScheduleDays)
        .where(
          and(
            eq(hostScheduleDays.hostStudentId, hostId),
            eq(hostScheduleDays.date, parsed.date),
          ),
        );
      for (const d of existingDay) {
        await db.delete(hostScheduleDays).where(eq(hostScheduleDays.id, d.id));
      }

      const [day] = await db
        .insert(hostScheduleDays)
        .values({
          hostStudentId: hostId,
          date: parsed.date,
          dayType: parsed.dayType ?? undefined,
          sourceFileName: file.name,
          importBatchId: batch.id,
        })
        .returning({ id: hostScheduleDays.id });

      if (parsed.blocks.length) {
        await db.insert(hostScheduleBlocks).values(
          parsed.blocks.map((b) => ({
            scheduleDayId: day.id,
            blockLabel: b.blockLabel,
            courseTitle: b.courseTitle,
            courseCode: b.courseCode,
            startTime: b.startTime,
            endTime: b.endTime,
            room: b.room,
            teacher: b.teacher,
            isAcademic: b.isAcademic,
          })),
        );
      }

      perFile.push({
        fileName: file.name,
        status: `${parsed.studentName} · ${parsed.date} · ${parsed.dayType ?? "?"} · ${parsed.blocks.length} blocks`,
      });
    } catch (e) {
      perFile.push({
        fileName: file.name,
        status: `Error: ${e instanceof Error ? e.message : "parse failed"}`,
      });
    }
  }

  revalidatePath("/admin/uploads");
  revalidatePath("/admin");
  return {
    ok: true,
    message: `Processed ${files.length} file(s).`,
    perFile,
  };
}
