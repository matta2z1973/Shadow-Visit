"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { hostStudents, hostStudentInterests } from "@/lib/db/schema";
import { composeName } from "@/lib/names";
import { eq } from "drizzle-orm";

const updateSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string().trim().max(120).optional(),
  lastName: z.string().trim().max(120).optional(),
  grade: z.coerce.number().int().min(1).max(12).optional(),
  gradYear: z.coerce.number().int().min(2020).max(2040).optional(),
  gender: z.enum(["M", "F"]).optional().or(z.literal("")),
  active: z.coerce.boolean().optional(),
});

export async function updateHost(formData: FormData) {
  await requireAdmin();
  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    firstName: formData.get("firstName") || undefined,
    lastName: formData.get("lastName") || undefined,
    grade: formData.get("grade") || undefined,
    gradYear: formData.get("gradYear") || undefined,
    gender: formData.get("gender") || "",
    active: formData.get("active") === "on",
  });
  if (!parsed.success) return;
  const first = parsed.data.firstName ?? null;
  const last = parsed.data.lastName ?? null;
  await db
    .update(hostStudents)
    .set({
      firstName: first,
      lastName: last,
      fullName: composeName(first, last) || "(unknown)",
      grade: parsed.data.grade ?? null,
      gradYear: parsed.data.gradYear ?? null,
      gender: (parsed.data.gender || null) as "M" | "F" | null,
      active: parsed.data.active ?? false,
    })
    .where(eq(hostStudents.id, parsed.data.id));
  revalidatePath("/admin/hosts");
}

export async function setHostInterests(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const interestIds = z
    .array(z.string().uuid())
    .safeParse(formData.getAll("interestIds"));
  if (!interestIds.success) return;

  await db
    .delete(hostStudentInterests)
    .where(eq(hostStudentInterests.hostStudentId, id.data));
  if (interestIds.data.length) {
    await db
      .insert(hostStudentInterests)
      .values(interestIds.data.map((interestId) => ({ hostStudentId: id.data, interestId })));
  }
  revalidatePath("/admin/hosts");
}

export async function deleteHost(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  await db.delete(hostStudents).where(eq(hostStudents.id, id.data));
  revalidatePath("/admin/hosts");
}
