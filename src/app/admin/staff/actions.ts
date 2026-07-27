"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { staff, facultyInterests } from "@/lib/db/schema";
import { composeName } from "@/lib/names";
import { eq } from "drizzle-orm";

const addSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().max(120).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  kind: z.enum(["faculty", "admissions"]),
});

export async function addStaff(formData: FormData) {
  await requireAdmin();
  const parsed = addSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName") || undefined,
    email: formData.get("email") || "",
    kind: formData.get("kind"),
  });
  if (!parsed.success) return;
  const first = parsed.data.firstName;
  const last = parsed.data.lastName ?? null;
  await db.insert(staff).values({
    firstName: first,
    lastName: last,
    fullName: composeName(first, last),
    email: parsed.data.email ? parsed.data.email : null,
    kind: parsed.data.kind,
  });
  revalidatePath("/admin/staff");
}

export async function deleteStaff(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  await db.delete(staff).where(eq(staff.id, id.data));
  revalidatePath("/admin/staff");
}

export async function setFacultyInterests(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().safeParse(formData.get("staffId"));
  if (!id.success) return;
  const interestIds = z
    .array(z.string().uuid())
    .safeParse(formData.getAll("interestIds"));
  if (!interestIds.success) return;

  await db.delete(facultyInterests).where(eq(facultyInterests.staffId, id.data));
  if (interestIds.data.length) {
    await db.insert(facultyInterests).values(
      interestIds.data.map((interestId) => ({ staffId: id.data, interestId })),
    );
  }
  revalidatePath("/admin/staff");
}

const feedSchema = z.object({
  id: z.string().uuid(),
  calendarFeedUrl: z.string().trim().url().optional().or(z.literal("")),
});

export async function setStaffFeed(formData: FormData) {
  await requireAdmin();
  const parsed = feedSchema.safeParse({
    id: formData.get("id"),
    calendarFeedUrl: formData.get("calendarFeedUrl") || "",
  });
  if (!parsed.success) return;
  await db
    .update(staff)
    .set({ calendarFeedUrl: parsed.data.calendarFeedUrl || null })
    .where(eq(staff.id, parsed.data.id));
  revalidatePath("/admin/staff");
  revalidatePath("/admin/availability");
}
