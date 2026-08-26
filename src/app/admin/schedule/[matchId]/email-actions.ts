"use server";

import { requireAdmin } from "@/lib/auth";
import { emailHostSchedule, type EmailHostScheduleResult } from "@/lib/matching/email-host-schedule";

export async function emailScheduleToHost(
  _prev: EmailHostScheduleResult | undefined,
  formData: FormData,
): Promise<EmailHostScheduleResult> {
  await requireAdmin();
  const matchId = formData.get("matchId") as string | null;
  if (!matchId) return { ok: false, message: "Missing match id." };
  return emailHostSchedule(matchId);
}
