"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { syncAllHostSchedules } from "@/lib/schedule/ics-sync";

export type RefreshState = { ok: boolean; message: string };

export async function refreshSchedules(): Promise<RefreshState> {
  await requireAdmin();

  const outcome = await syncAllHostSchedules();
  if (!outcome.ok) {
    return { ok: false, message: outcome.message };
  }

  const { results, season } = outcome;
  const synced = results.filter((r) => r.status === "synced").length;
  const totalDays = results.reduce((sum, r) => sum + (r.daysSynced ?? 0), 0);
  const errors = results.filter((r) => r.status === "error");

  revalidatePath("/admin/hosts/schedules");
  revalidatePath("/admin/match");
  revalidatePath("/admin");

  return {
    ok: true,
    message:
      `Checked ${results.length} host(s) with a saved calendar link across ${season.start} to ${season.end} — ` +
      `${synced} updated (${totalDays} day(s) total).` +
      (errors.length
        ? ` ${errors.length} failed: ${errors.map((e) => e.hostName).join(", ")}.`
        : ""),
  };
}
