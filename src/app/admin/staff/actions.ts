"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { staff, facultyInterests, interviewerAvailability } from "@/lib/db/schema";
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

// Fixed interview time-slot templates for one admissions staff member (date
// range + weekdays + 30-min blocks). Interview scheduling for prospectives is
// built from these instead of the interviewer's live calendar.
const availabilitySchema = z.object({
  staffId: z.string().uuid(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  weekdays: z.array(z.coerce.number().int().min(1).max(5)).min(1),
  timeBlocks: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1),
});

export async function addInterviewerAvailability(formData: FormData) {
  await requireAdmin();
  const parsed = availabilitySchema.safeParse({
    staffId: formData.get("staffId"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    weekdays: formData.getAll("weekdays"),
    timeBlocks: formData.getAll("timeBlocks"),
  });
  if (!parsed.success) return;
  if (parsed.data.endDate < parsed.data.startDate) return;

  await db.insert(interviewerAvailability).values({
    staffId: parsed.data.staffId,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate,
    weekdays: [...new Set(parsed.data.weekdays)].sort(),
    timeBlocks: [...new Set(parsed.data.timeBlocks)].sort(),
  });
  revalidatePath("/admin/staff");
}

export async function deleteInterviewerAvailability(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  await db.delete(interviewerAvailability).where(eq(interviewerAvailability.id, id.data));
  revalidatePath("/admin/staff");
}
