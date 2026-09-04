"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hostStudents, hostStudentInterests } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const schema = z.object({
  grade: z.coerce.number().int().min(1).max(12).optional(),
  gender: z.enum(["M", "F"]).optional(),
  interestIds: z.array(z.string().uuid()),
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
    return { ok: false, message: "Please check your entries." };
  }

  const [host] = await db
    .select()
    .from(hostStudents)
    .where(eq(hostStudents.profileId, user.id))
    .limit(1);
  if (!host) return { ok: false, message: "No host record found." };

  await db
    .update(hostStudents)
    .set({ grade: parsed.data.grade ?? null, gender: parsed.data.gender ?? null })
    .where(eq(hostStudents.id, host.id));

  // Replace the interest set.
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
