"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  matches,
  matchMeetings,
  prospectiveStudents,
} from "@/lib/db/schema";
import { getMatchDataForDate } from "@/lib/matching/loader";
import { hostScheduleDays, hostScheduleBlocks } from "@/lib/db/schema";
import { academicLettersFor } from "@/lib/schedule/us-blocks";
import { emailHostSchedule } from "@/lib/matching/email-host-schedule";
import { and, eq, inArray } from "drizzle-orm";

// Derive day-type + free-period count for a host on a date straight from the
// stored schedule (keeps values correct even when admin overrides the host).
async function deriveHostDay(
  hostStudentId: string,
  date: string,
): Promise<{ dayType: "green" | "gold" | null; freePeriodCount: number | null }> {
  const [day] = await db
    .select()
    .from(hostScheduleDays)
    .where(
      and(
        eq(hostScheduleDays.hostStudentId, hostStudentId),
        eq(hostScheduleDays.date, date),
      ),
    )
    .limit(1);
  if (!day) return { dayType: null, freePeriodCount: null };
  const dayType = (day.dayType as "green" | "gold" | null) ?? null;
  if (!dayType) return { dayType: null, freePeriodCount: null };

  const blocks = await db
    .select()
    .from(hostScheduleBlocks)
    .where(eq(hostScheduleBlocks.scheduleDayId, day.id));
  const present = new Set(
    blocks
      .filter((b) => b.isAcademic)
      .map((b) => b.blockLabel.trim().charAt(0).toUpperCase()),
  );
  const free = academicLettersFor(dayType).filter((l) => !present.has(l)).length;
  return { dayType, freePeriodCount: free };
}

// Create/replace the confirmed match for one prospective, and place the
// interview on the day at the chosen interviewer's fixed slot (see
// src/lib/matching/interview-slots.ts — replaces the old family-selected
// free-form time).
async function writeMatch(args: {
  prospectiveId: string;
  hostStudentId: string | null;
  shadowDate: string;
  dayType: "green" | "gold" | null;
  freePeriodCount: number | null;
  score: number | null;
  interviewSlot: { staffId: string; start: string; end: string } | null;
  createdBy: string;
}) {
  await db.delete(matches).where(eq(matches.prospectiveId, args.prospectiveId));

  const [m] = await db
    .insert(matches)
    .values({
      prospectiveId: args.prospectiveId,
      hostStudentId: args.hostStudentId,
      shadowDate: args.shadowDate,
      dayType: args.dayType ?? undefined,
      status: "confirmed",
      score: args.score ?? undefined,
      freePeriodCount: args.freePeriodCount ?? undefined,
      createdBy: args.createdBy,
    })
    .returning({ id: matches.id });

  if (args.interviewSlot) {
    await db
      .update(prospectiveStudents)
      .set({
        interviewerStaffId: args.interviewSlot.staffId,
        interviewDate: args.shadowDate,
        interviewStart: `${args.interviewSlot.start}:00`,
        interviewEnd: `${args.interviewSlot.end}:00`,
      })
      .where(eq(prospectiveStudents.id, args.prospectiveId));
  }

  const [p] = await db
    .select()
    .from(prospectiveStudents)
    .where(eq(prospectiveStudents.id, args.prospectiveId))
    .limit(1);
  if (p?.interviewDate && p.interviewStart && p.interviewEnd) {
    await db.insert(matchMeetings).values({
      matchId: m.id,
      kind: "admissions_interview",
      staffId: p.interviewerStaffId,
      startTime: p.interviewStart,
      endTime: p.interviewEnd,
      notes: `Interview on ${p.interviewDate}`,
    });
  }
  return m.id;
}

const confirmSchema = z.object({
  prospectiveId: z.string().uuid(),
  hostStudentId: z.string().uuid().optional().or(z.literal("")),
  shadowDate: z.string(),
  dayType: z.enum(["green", "gold"]).optional().or(z.literal("")),
  freePeriodCount: z.coerce.number().int().optional(),
  score: z.coerce.number().int().optional(),
  // "<staffId>::<HH:MM>", from the fixed-slot dropdown on /admin/match.
  interviewSlot: z.string().optional().or(z.literal("")),
});

function parseInterviewSlot(
  raw: string | undefined,
): { staffId: string; start: string; end: string } | null {
  if (!raw) return null;
  const [staffId, start] = raw.split("::");
  if (!staffId || !start) return null;
  const [h, m] = start.split(":").map(Number);
  const total = h * 60 + m + 30;
  const end = `${Math.floor(total / 60).toString().padStart(2, "0")}:${(total % 60)
    .toString()
    .padStart(2, "0")}`;
  return { staffId, start, end };
}

export async function confirmMatch(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = confirmSchema.safeParse({
    prospectiveId: formData.get("prospectiveId"),
    hostStudentId: formData.get("hostStudentId") || "",
    shadowDate: formData.get("shadowDate"),
    dayType: formData.get("dayType") || "",
    freePeriodCount: formData.get("freePeriodCount") || undefined,
    score: formData.get("score") || undefined,
    interviewSlot: formData.get("interviewSlot") || "",
  });
  if (!parsed.success) return;

  const hostId = parsed.data.hostStudentId || null;
  const derived = hostId
    ? await deriveHostDay(hostId, parsed.data.shadowDate)
    : { dayType: null, freePeriodCount: null };

  await writeMatch({
    prospectiveId: parsed.data.prospectiveId,
    hostStudentId: hostId,
    shadowDate: parsed.data.shadowDate,
    dayType: derived.dayType,
    freePeriodCount: derived.freePeriodCount,
    score: parsed.data.score ?? null,
    interviewSlot: parseInterviewSlot(parsed.data.interviewSlot),
    createdBy: admin.id,
  });

  revalidatePath("/admin/match");
  revalidatePath("/admin/hosts");
}

// Confirm the engine's best host for every prospective on the date.
export async function bulkConfirmBest(formData: FormData) {
  const admin = await requireAdmin();
  const date = z.string().safeParse(formData.get("date"));
  if (!date.success) return;

  const data = await getMatchDataForDate(date.data);
  for (const r of data.rankings) {
    if (!r.best) continue;
    await writeMatch({
      prospectiveId: r.prospectiveId,
      hostStudentId: r.best.hostStudentId,
      shadowDate: date.data,
      dayType:
        (data.hosts.find((h) => h.id === r.best!.hostStudentId)?.dayType as
          | "green"
          | "gold"
          | null) ?? null,
      freePeriodCount: r.best.freePeriodCount,
      score: r.best.score,
      interviewSlot: null,
      createdBy: admin.id,
    });
  }
  revalidatePath("/admin/match");
  revalidatePath("/admin/hosts");
}

export type EmailSchedulesResult = { ok: boolean; message: string };

// Email every confirmed/sent match's host their schedule for the date.
export async function emailSchedulesForDate(
  _prev: EmailSchedulesResult | undefined,
  formData: FormData,
): Promise<EmailSchedulesResult> {
  await requireAdmin();
  const date = z.string().safeParse(formData.get("date"));
  if (!date.success) return { ok: false, message: "Missing date." };

  const dateMatches = await db
    .select({ id: matches.id })
    .from(matches)
    .where(and(eq(matches.shadowDate, date.data), inArray(matches.status, ["confirmed", "sent"])));

  if (!dateMatches.length) {
    return { ok: false, message: "No confirmed matches on this date yet." };
  }

  let sent = 0;
  const failures: string[] = [];
  for (const m of dateMatches) {
    const result = await emailHostSchedule(m.id);
    if (result.ok) sent++;
    else failures.push(result.message);
  }

  return {
    ok: true,
    message:
      `Sent ${sent}/${dateMatches.length}.` +
      (failures.length ? ` Skipped: ${failures.join("; ")}` : ""),
  };
}
