"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hostStudents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getOrCreateHost } from "@/lib/hosts";
import { parseHostIcsFeed } from "@/lib/schedule/parse-host-ics";

export type ScheduleLinkState = { ok: boolean; message: string };

// The host's calendar is fetched live wherever it's needed (matching,
// schedule comparison, per-match timeline) — this just validates the link
// works and saves it. Nothing about the schedule itself is stored.
export async function saveMyScheduleLink(
  _prev: ScheduleLinkState | undefined,
  formData: FormData,
): Promise<ScheduleLinkState> {
  const user = await requireUser();
  const host = await getOrCreateHost(user);

  const url = (formData.get("icsUrl") as string | null)?.trim();
  if (!url) return { ok: false, message: "Paste your calendar link first." };
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, message: "That doesn't look like a link — copy the full https:// URL." };
  }

  let text: string;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return {
        ok: false,
        message: `That link responded with an error (HTTP ${res.status}). Double-check it's the ICS link, not the HTML one.`,
      };
    }
    text = await res.text();
  } catch {
    return { ok: false, message: "Couldn't reach that link. Double-check you copied it correctly." };
  }

  if (!/BEGIN:VCALENDAR/i.test(text)) {
    return {
      ok: false,
      message: "That link didn't return a calendar file — make sure it ends in .ics, not .html.",
    };
  }

  const feed = parseHostIcsFeed(text);
  if (feed.size === 0) {
    return {
      ok: false,
      message: "That calendar loaded, but no school days were found in it. Is this the right calendar?",
    };
  }

  await db.update(hostStudents).set({ icsUrl: url }).where(eq(hostStudents.id, host.id));

  const dates = [...feed.keys()].sort();
  revalidatePath("/me");
  revalidatePath("/admin/hosts");
  revalidatePath("/admin");
  return {
    ok: true,
    message: `Saved — found ${feed.size} school day(s), ${dates[0]} to ${dates[dates.length - 1]}.`,
  };
}

export async function clearMyScheduleLink(): Promise<void> {
  const user = await requireUser();
  const host = await getOrCreateHost(user);
  await db.update(hostStudents).set({ icsUrl: null }).where(eq(hostStudents.id, host.id));
  revalidatePath("/me");
  revalidatePath("/admin/hosts");
}
