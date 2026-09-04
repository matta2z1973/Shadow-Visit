"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { hostStudents, hostStudentInterests } from "@/lib/db/schema";
import { getShadowSeason } from "@/lib/schedule/season";
import { applyTestHostSchedule, createDefaultTestHosts } from "@/lib/schedule/test-hosts";
import { BLOCK_LETTERS, type TestHostBlockInput } from "@/lib/schedule/test-course-catalog";

export type TestHostActionResult = { ok: boolean; message: string };

export async function createDefaultTestHostsAction(): Promise<TestHostActionResult> {
  await requireAdmin();
  const { created, season } = await createDefaultTestHosts();
  revalidatePath("/admin/settings/test-hosts");
  revalidatePath("/admin/hosts");
  return {
    ok: true,
    message:
      created > 0
        ? `Created ${created} test host(s), scheduled across ${season.start} to ${season.end}.`
        : "All 4 default test hosts already exist.",
  };
}

const saveSchema = z.object({
  hostId: z.string().uuid(),
  fullName: z.string().trim().min(1, "Name is required."),
  grade: z.coerce.number().int().min(1).max(12),
  gender: z.enum(["M", "F"]),
});

export async function saveTestHostAction(
  _prev: TestHostActionResult | undefined,
  formData: FormData,
): Promise<TestHostActionResult> {
  await requireAdmin();

  const parsed = saveSchema.safeParse({
    hostId: formData.get("hostId"),
    fullName: formData.get("fullName"),
    grade: formData.get("grade"),
    gender: formData.get("gender"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid form submission." };
  }

  const season = await getShadowSeason();
  if (!season) {
    return { ok: false, message: "Set a shadow visit season first (Settings → Season)." };
  }

  const blocks: TestHostBlockInput[] = BLOCK_LETTERS.map((letter) => {
    const raw = String(formData.get(`block${letter}Course`) ?? "").trim();
    return { letter, courseTitle: raw || null };
  });

  await db
    .update(hostStudents)
    .set({ fullName: parsed.data.fullName, grade: parsed.data.grade, gender: parsed.data.gender })
    .where(eq(hostStudents.id, parsed.data.hostId));

  await applyTestHostSchedule(parsed.data.hostId, blocks, season);

  const interestIds = formData.getAll("interestIds").filter((v): v is string => typeof v === "string");
  await db.delete(hostStudentInterests).where(eq(hostStudentInterests.hostStudentId, parsed.data.hostId));
  if (interestIds.length) {
    await db
      .insert(hostStudentInterests)
      .values(interestIds.map((interestId) => ({ hostStudentId: parsed.data.hostId, interestId })))
      .onConflictDoNothing();
  }

  revalidatePath("/admin/settings/test-hosts");
  revalidatePath("/admin/hosts");
  revalidatePath("/admin/match");
  return { ok: true, message: `Saved and applied across ${season.start} to ${season.end}.` };
}

export async function deleteTestHostAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const hostId = formData.get("hostId");
  if (typeof hostId !== "string") return;
  await db.delete(hostStudents).where(eq(hostStudents.id, hostId));
  revalidatePath("/admin/settings/test-hosts");
  revalidatePath("/admin/hosts");
}
