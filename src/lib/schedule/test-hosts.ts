// Curated default schedules for the built-in "TestHost" practice hosts —
// entirely manually-entered data (no ICS calendar), meant to reliably
// produce visible matches for testing without depending on a real Outlook
// feed. Edited on /admin/settings/test-hosts.
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

export const TEST_HOST_PREFIX = "TESTHOST-";

export type TestHostBlockInput = {
  letter: string; // "A".."H"
  courseTitle: string;
  isAcademic: boolean;
};

export type TestHostDefault = {
  externalId: string;
  fullName: string;
  grade: number;
  gender: "M" | "F";
  dayType: "green" | "gold";
  blocks: TestHostBlockInput[];
  interestNames: string[];
};

// Grades/genders span the spread the built-in test prospective data uses
// (scripts/seed-testdata.ts), and each host's classes are picked to hit real
// course-catalog keyword matches (src/lib/matching/course-map.ts) for the
// interests most commonly requested at that grade/gender combo.
export const DEFAULT_TEST_HOSTS: TestHostDefault[] = [
  {
    externalId: `${TEST_HOST_PREFIX}1`,
    fullName: "TestHost1",
    grade: 9,
    gender: "M",
    dayType: "green",
    blocks: [
      { letter: "A", courseTitle: "Chinese II", isAcademic: true },
      { letter: "B", courseTitle: "Chemistry", isAcademic: true },
      { letter: "C", courseTitle: "Advanced Algebra II", isAcademic: true },
      { letter: "D", courseTitle: "Computer Science A", isAcademic: true },
    ],
    interestNames: ["Debate/Speech", "Community Service", "Entrepreneurship"],
  },
  {
    externalId: `${TEST_HOST_PREFIX}2`,
    fullName: "TestHost2",
    grade: 10,
    gender: "F",
    dayType: "gold",
    blocks: [
      { letter: "E", courseTitle: "Chemistry", isAcademic: true },
      { letter: "F", courseTitle: "US History", isAcademic: true },
      { letter: "G", courseTitle: "English 10", isAcademic: true },
      { letter: "H", courseTitle: "Advanced Automation", isAcademic: true },
    ],
    interestNames: ["Filmmaking", "Entrepreneurship", "Drama/Theater"],
  },
  {
    externalId: `${TEST_HOST_PREFIX}3`,
    fullName: "TestHost3",
    grade: 11,
    gender: "M",
    dayType: "green",
    blocks: [
      { letter: "A", courseTitle: "Latin II", isAcademic: true },
      { letter: "B", courseTitle: "US History", isAcademic: true },
      { letter: "C", courseTitle: "Advanced Automation", isAcademic: true },
      { letter: "D", courseTitle: "Computer Science A", isAcademic: true },
    ],
    interestNames: ["Drama/Theater", "Community Service"],
  },
  {
    externalId: `${TEST_HOST_PREFIX}4`,
    fullName: "TestHost4",
    grade: 12,
    gender: "F",
    dayType: "gold",
    blocks: [
      { letter: "E", courseTitle: "Spanish III", isAcademic: true },
      { letter: "F", courseTitle: "Chinese II", isAcademic: true },
      { letter: "G", courseTitle: "Computer Science A", isAcademic: true },
      { letter: "H", courseTitle: "Chamber Orchestra", isAcademic: true },
    ],
    interestNames: ["Community Service", "2D/Studio Art"],
  },
];

// Used only when creating the default test hosts for the very first time and
// no season has been configured yet — a generous fall-through-spring window
// so there's no chicken-and-egg "can't create test data, no season exists"
// dead end. Admins can change it anytime on Settings → Season.
const FALLBACK_SEASON: ShadowSeason = { start: "2026-09-01", end: "2027-06-05" };

function timesFor(letter: string, dayType: "green" | "gold"): { start: string; end: string } {
  const slot = blockGridFor(dayType).find((b) => b.label === letter);
  return slot
    ? { start: slot.startTime, end: slot.endTime }
    : { start: "08:30:00", end: "09:50:00" };
}

// Applies the same day-type + block list to every weekday in the season,
// replacing whatever that host had on file in the range. Test hosts don't
// have a real calendar to sync from, so — unlike real hosts — every day gets
// an identical schedule rather than whatever a feed happens to contain.
export async function applyTestHostSchedule(
  hostId: string,
  dayType: "green" | "gold",
  blocks: TestHostBlockInput[],
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

  const dates: string[] = [];
  const cursor = new Date(`${season.start}T00:00:00Z`);
  const end = new Date(`${season.end}T00:00:00Z`);
  while (cursor <= end) {
    const weekday = cursor.getUTCDay(); // 0=Sun..6=Sat
    if (weekday !== 0 && weekday !== 6) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  if (!dates.length) return;

  const insertedDays = await db
    .insert(hostScheduleDays)
    .values(dates.map((date) => ({ hostStudentId: hostId, date, dayType })))
    .returning({ id: hostScheduleDays.id });

  const blockRows = insertedDays.flatMap((day) =>
    blocks.map((b) => {
      const t = timesFor(b.letter, dayType);
      return {
        scheduleDayId: day.id,
        blockLabel: `${b.letter} Block`,
        courseTitle: b.courseTitle,
        courseCode: null,
        room: "Test Room",
        teacher: "Test Teacher",
        isAcademic: b.isAcademic,
        startTime: t.start,
        endTime: t.end,
      };
    }),
  );
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

    await applyTestHostSchedule(host.id, def.dayType, def.blocks, season);

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
