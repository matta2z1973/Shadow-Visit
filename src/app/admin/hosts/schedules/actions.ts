"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { syncSchedulesForDate } from "@/lib/schedule/ics-sync";

export type RefreshState = { ok: boolean; message: string };

export async function refreshSchedules(
  _prev: RefreshState | undefined,
  formData: FormData,
): Promise<RefreshState> {
  await requireAdmin();
  const date = formData.get("date") as string | null;
  if (!date) return { ok: false, message: "Pick a date first." };

  const results = await syncSchedulesForDate(date);
  const synced = results.filter((r) => r.status === "synced").length;
  const errors = results.filter((r) => r.status === "error");

  revalidatePath("/admin/hosts/schedules");
  revalidatePath("/admin/match");
  revalidatePath("/admin");

  return {
    ok: true,
    message:
      `Checked ${results.length} host(s) with a saved calendar link — ${synced} updated for ${date}.` +
      (errors.length
        ? ` ${errors.length} failed: ${errors.map((e) => e.hostName).join(", ")}.`
        : ""),
  };
}
