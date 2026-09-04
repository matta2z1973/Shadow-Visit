"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hostStudents, hostStudentInterests } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const schema = z.object({
  grade: z.coerce.number().int().min(1).max(12),
  gender: z.enum(["M", "F"]),
  interestIds: z.array(z.string().uuid()).min(1),
});

export type SaveState = { ok: boolean; message: string };

export async function saveMe(
  _prev: SaveState | undefined,
  formData: FormData,
): Promise<SaveState> {
  const user = await requireUser();

  const parsed = schema.safeParse({
    grade: formData.get("grade") || undefined,
    gender: formData.get("gender") || undefined,
    interestIds: formData.getAll("interestIds"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: "Grade, gender, and at least one interest are required.",
    };
  }

  const [host] = await db
    .select()
    .from(hostStudents)
    .where(eq(hostStudents.profileId, user.id))
    .limit(1);
  if (!host) return { ok: false, message: "No host record found." };

  await db
    .update(hostStudents)
    .set({ grade: parsed.data.grade, gender: parsed.data.gender })
    .where(eq(hostStudents.id, host.id));

  // Replace the interest set. interestIds is guaranteed non-empty here (schema
  // requires at least one), but the insert still guards on length for safety.
  await db
    .delete(hostStudentInterests)
    .where(eq(hostStudentInterests.hostStudentId, host.id));
  if (parsed.data.interestIds.length) {
    await db.insert(hostStudentInterests).values(
      parsed.data.interestIds.map((interestId) => ({
        hostStudentId: host.id,
        interestId,
      })),
    );
  }

  revalidatePath("/me");
  redirect("/me/confirmation");
}
