"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { saveShadowSeason } from "@/lib/schedule/season";

export type SaveSeasonResult = { ok: boolean; message: string };

const schema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid start date."),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid end date."),
});

export async function saveSeasonAction(
  _prev: SaveSeasonResult | undefined,
  formData: FormData,
): Promise<SaveSeasonResult> {
  await requireAdmin();
  const parsed = schema.safeParse({
    start: formData.get("start"),
    end: formData.get("end"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid dates." };
  }
  if (parsed.data.end < parsed.data.start) {
    return { ok: false, message: "End date must be on or after the start date." };
  }

  await saveShadowSeason(parsed.data);

  revalidatePath("/admin/settings/season");
  return { ok: true, message: "Season saved. Refresh schedules to sync this range." };
}
