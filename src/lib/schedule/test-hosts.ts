// Server-side logic for the built-in "TestHost" practice hosts — hosts with
// a hand-entered schedule instead of a real Outlook calendar, editable on
// /admin/settings/test-hosts. See test-course-catalog.ts for the curated
// course list these draw from.
import { db } from "@/lib/db";
import {
  hostStudents,
  hostStudentInterests,
  hostScheduleDays,
  hostScheduleBlocks,
  interests,
} from "@/lib/db/schema";
import { and, eq, gte, lte, like } from "drizzle-orm";
import { blockGridFor } from "./us-blocks";
import { getShadowSeason, saveShadowSeason, type ShadowSeason } from "./season";
import {
  BLOCK_LETTERS,
  dayTypeForLetter,
  defaultBlocksForGrade,
  type BlockLetter,
  type TestHostBlockInput,
} from "./test-course-catalog";

export const TEST_HOST_PREFIX = "TESTHOST-";

export type TestHostDefault = {
  externalId: string;
  fullName: string;
  grade: number;
  gender: "M" | "F";
  interestNames: string[]; // supplementary self-interests, beyond their classes
};

export const DEFAULT_TEST_HOSTS: TestHostDefault[] = [
  { externalId: `${TEST_HOST_PREFIX}1`, fullName: "TestHost1", grade: 9, gender: "M", interestNames: ["Debate/Speech", "Community Service"] },
  { externalId: `${TEST_HOST_PREFIX}2`, fullName: "TestHost2", grade: 10, gender: "F", interestNames: ["Drama/Theater", "Entrepreneurship"] },
  { externalId: `${TEST_HOST_PREFIX}3`, fullName: "TestHost3", grade: 11, gender: "M", interestNames: ["Community Service", "Filmmaking"] },
  { externalId: `${TEST_HOST_PREFIX}4`, fullName: "TestHost4", grade: 12, gender: "F", interestNames: ["2D/Studio Art", "Community Service"] },
];

// Used only when creating the default test hosts for the very first time and
// no season has been configured yet — a generous fall-through-spring window
// so there's no chicken-and-egg "can't create test data, no season exists"
// dead end. Admins can change it anytime on Settings → Season.
const FALLBACK_SEASON: ShadowSeason = { start: "2026-09-01", end: "2027-06-05" };

function timesFor(letter: BlockLetter): { start: string; end: string } {
  const dayType = dayTypeForLetter(letter);
  const slot = blockGridFor(dayType).find((b) => b.label === letter);
  return slot ? { start: slot.startTime, end: slot.endTime } : { start: "08:30:00", end: "09:50:00" };
}

// Applies an 8-block (A-H) template across the whole season. A real school's
// green/gold rotation isn't derivable from anything we store for test hosts
// (no calendar to read it from), so this alternates every weekday in season
// order starting from green — deterministic and shared by every test host,
// same as how one real school is on the same rotation for everyone. This is
// what makes a course sitting on, say, block E actually show up on some
// dates and not others, instead of every day being identical.
export async function applyTestHostSchedule(
  hostId: string,
  blocks: TestHostBlockInput[], // exactly 8, letters A..H
  season: ShadowSeason,
): Promise<void> {
  await db
    .delete(hostScheduleDays)
    .where(
      and(
        eq(hostScheduleDays.hostStudentId, hostId),
        gte(hostScheduleDays.date, season.start),
        lte(hostScheduleDays.date, season.end),
      ),
    );

  const byLetter = new Map(blocks.map((b) => [b.letter, b]));
  const greenBlocks = (["A", "B", "C", "D"] as BlockLetter[])
    .map((l) => byLetter.get(l))
    .filter((b): b is TestHostBlockInput => !!b);
  const goldBlocks = (["E", "F", "G", "H"] as BlockLetter[])
    .map((l) => byLetter.get(l))
    .filter((b): b is TestHostBlockInput => !!b);

  const dates: { date: string; dayType: "green" | "gold" }[] = [];
  const cursor = new Date(`${season.start}T00:00:00Z`);
  const end = new Date(`${season.end}T00:00:00Z`);
  let weekdayIndex = 0;
  while (cursor <= end) {
    const weekday = cursor.getUTCDay(); // 0=Sun..6=Sat
    if (weekday !== 0 && weekday !== 6) {
      dates.push({
        date: cursor.toISOString().slice(0, 10),
        dayType: weekdayIndex % 2 === 0 ? "green" : "gold",
      });
      weekdayIndex++;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  if (!dates.length) return;

  const insertedDays = await db
    .insert(hostScheduleDays)
    .values(dates.map((d) => ({ hostStudentId: hostId, date: d.date, dayType: d.dayType })))
    .returning({ id: hostScheduleDays.id, date: hostScheduleDays.date });

  const dayTypeByDate = new Map(dates.map((d) => [d.date, d.dayType]));
  const blockRows = insertedDays.flatMap((day) => {
    const dayType = dayTypeByDate.get(day.date)!;
    const dayBlocks = dayType === "green" ? greenBlocks : goldBlocks;
    return dayBlocks
      .filter((b) => b.courseTitle) // a free block gets no row at all
      .map((b) => {
        const t = timesFor(b.letter);
        return {
          scheduleDayId: day.id,
          blockLabel: `${b.letter} Block`,
          courseTitle: b.courseTitle,
          courseCode: null,
          room: "Test Room",
          teacher: "Test Teacher",
          isAcademic: true,
          startTime: t.start,
          endTime: t.end,
        };
      });
  });
  if (blockRows.length) await db.insert(hostScheduleBlocks).values(blockRows);
}

export async function createDefaultTestHosts(): Promise<{ created: number; season: ShadowSeason }> {
  let season = await getShadowSeason();
  if (!season) {
    await saveShadowSeason(FALLBACK_SEASON);
    season = FALLBACK_SEASON;
  }

  const allInterests = await db.select().from(interests);
  const byName = new Map(allInterests.map((i) => [i.name, i.id]));

  let created = 0;
  for (const def of DEFAULT_TEST_HOSTS) {
    const [existing] = await db
      .select({ id: hostStudents.id })
      .from(hostStudents)
      .where(eq(hostStudents.externalId, def.externalId))
      .limit(1);
    if (existing) continue; // don't clobber an admin's edits on a repeat click

    const [host] = await db
      .insert(hostStudents)
      .values({
        externalId: def.externalId,
        fullName: def.fullName,
        grade: def.grade,
        gender: def.gender,
        active: true,
      })
      .returning({ id: hostStudents.id });

    await applyTestHostSchedule(host.id, defaultBlocksForGrade(def.grade), season);

    const interestIds = def.interestNames.map((n) => byName.get(n)).filter((x): x is string => !!x);
    if (interestIds.length) {
      await db
        .insert(hostStudentInterests)
        .values(interestIds.map((interestId) => ({ hostStudentId: host.id, interestId })))
        .onConflictDoNothing();
    }
    created++;
  }

  return { created, season };
}

export function listTestHosts() {
  return db
    .select()
    .from(hostStudents)
    .where(like(hostStudents.externalId, `${TEST_HOST_PREFIX}%`))
    .orderBy(hostStudents.externalId);
}

export { BLOCK_LETTERS };
