"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { prospectiveStudents } from "@/lib/db/schema";
import { composeName } from "@/lib/names";
import { eq } from "drizzle-orm";

// "13:00" -> "13:00:00"; "" -> null
function normTime(v: FormDataEntryValue | null): string | null {
  const s = (v ?? "").toString().trim();
  if (!s) return null;
  return /^\d{2}:\d{2}$/.test(s) ? `${s}:00` : s;
}
function orNull(v: FormDataEntryValue | null): string | null {
  const s = (v ?? "").toString().trim();
  return s || null;
}

const schema = z.object({
  id: z.string().uuid(),
  firstName: z.string().trim().max(120).optional(),
  lastName: z.string().trim().max(120).optional(),
  grade: z.coerce.number().int().min(1).max(12).optional(),
  gender: z.enum(["M", "F"]).optional().or(z.literal("")),
  currentSchool: z.string().trim().max(200).optional(),
  familyEmail: z.string().trim().email().optional().or(z.literal("")),
  interviewerStaffId: z.string().uuid().optional().or(z.literal("")),
  wantsShadow: z.coerce.boolean().optional(),
});

export async function updateProspective(formData: FormData) {
  await requireAdmin();
  const parsed = schema.safeParse({
    id: formData.get("id"),
    firstName: formData.get("firstName") || undefined,
    lastName: formData.get("lastName") || undefined,
    grade: formData.get("grade") || undefined,
    gender: formData.get("gender") || "",
    currentSchool: formData.get("currentSchool") || undefined,
    familyEmail: formData.get("familyEmail") || "",
    interviewerStaffId: formData.get("interviewerStaffId") || "",
    wantsShadow: formData.get("wantsShadow") === "on",
  });
  if (!parsed.success) return;

  const first = parsed.data.firstName ?? null;
  const last = parsed.data.lastName ?? null;
  await db
    .update(prospectiveStudents)
    .set({
      firstName: first,
      lastName: last,
      fullName: composeName(first, last) || "(unknown)",
      grade: parsed.data.grade ?? null,
      gender: (parsed.data.gender || null) as "M" | "F" | null,
      currentSchool: parsed.data.currentSchool ?? null,
      familyEmail: parsed.data.familyEmail || null,
      interviewerStaffId: parsed.data.interviewerStaffId || null,
      wantsShadow: parsed.data.wantsShadow ?? false,
      shadowDate: orNull(formData.get("shadowDate")),
      interviewDate: orNull(formData.get("interviewDate")),
      interviewStart: normTime(formData.get("interviewStart")),
      interviewEnd: normTime(formData.get("interviewEnd")),
    })
    .where(eq(prospectiveStudents.id, parsed.data.id));
  revalidatePath("/admin/prospectives");
  revalidatePath("/admin/match");
}

export async function deleteProspective(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  await db.delete(prospectiveStudents).where(eq(prospectiveStudents.id, id.data));
  revalidatePath("/admin/prospectives");
}
