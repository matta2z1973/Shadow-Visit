// Seeds test data for exercising matching:
//   - 20 host students, each with interests and a schedule for one shadow date
//   - 10 prospective shadow-visit students with ranked interests on that date
// Re-runnable: clears prior TEST- rows first.  Run: npm run db:seed:test
import "./load-env";
import { db } from "../src/lib/db";
import {
  interests,
  hostStudents,
  hostStudentInterests,
  hostScheduleDays,
  hostScheduleBlocks,
  prospectiveStudents,
  prospectiveInterests,
} from "../src/lib/db/schema";
import { like } from "drizzle-orm";

const SHADOW_DATE = "2026-09-16";

// Block letter → time (green A-D, gold E-H share the same 4 windows).
const TIME: Record<string, { s: string; e: string }> = {
  A: { s: "08:30:00", e: "09:50:00" }, E: { s: "08:30:00", e: "09:50:00" },
  B: { s: "09:55:00", e: "11:15:00" }, F: { s: "09:55:00", e: "11:15:00" },
  C: { s: "11:50:00", e: "13:10:00" }, G: { s: "11:50:00", e: "13:10:00" },
  D: { s: "14:35:00", e: "15:55:00" }, H: { s: "14:35:00", e: "15:55:00" },
};

// Course pool → the interest name each course covers.
const COURSES: { title: string; code: string; interest: string }[] = [
  { title: "Chinese II", code: "U1201-1", interest: "Chinese" },
  { title: "AP Physics 1", code: "U5470-1", interest: "Science" },
  { title: "Chemistry", code: "U5310-4", interest: "Science" },
  { title: "US History", code: "U3300-2", interest: "History" },
  { title: "Spanish III", code: "U1801-1", interest: "Spanish" },
  { title: "Latin II", code: "U1601-1", interest: "Latin" },
  { title: "English 10", code: "U2100-3", interest: "English" },
  { title: "Advanced Algebra II", code: "U2220-2", interest: "Math" },
  { title: "Advanced Automation", code: "U9520-1", interest: "Engineering" },
  { title: "Computer Science A", code: "U9100-1", interest: "Computer Science" },
  { title: "Debate & Speech", code: "U4100-1", interest: "Debate/Speech" },
  { title: "Studio Art", code: "U7100-1", interest: "2D/Studio Art" },
  { title: "Theater Arts", code: "U7300-1", interest: "Drama/Theater" },
  { title: "Entrepreneurship", code: "U8100-1", interest: "Entrepreneurship" },
  { title: "Filmmaking", code: "U7400-1", interest: "Filmmaking" },
  { title: "Chamber Orchestra", code: "U7500-1", interest: "Chamber Orchestra" },
];

const ACTIVITIES = [
  "Basketball (boys/girls)", "Soccer (boys/girls)", "Cross Country (boys/girls)",
  "Robotics", "Automation/Robotics", "Community Service", "Yearbook", "Band",
];
const ACADEMIC_POOL = ["Chinese", "Science", "History", "Spanish", "Math", "English", "Latin"];
const ACTIVITY_POOL = [
  "Debate/Speech", "Entrepreneurship", "Engineering", "Basketball (boys/girls)",
  "Computer Science", "Filmmaking", "Drama/Theater", "2D/Studio Art",
  "Community Service", "Chamber Orchestra",
];

const FIRST = ["Ava","Liam","Mia","Noah","Zoe","Kai","Ivy","Eli","Nora","Owen","Aria","Leo","Maya","Jack","Ruby","Finn","Lena","Cole","Tess","Wyatt","Blake","Sana","Omar","Dev","Priya","Marco","Nina","Theo","Lucy","Sam"];
const LAST = ["Patel","Nguyen","Garcia","Kim","Johnson","Silva","Chen","Brooks","Rivera","Adams","Okafor","Haddad","Reyes","Cohen","Watson","Diaz","Park","Flynn","Ortiz","Bauer"];

function gradYearFor(grade: number): number {
  // 2026-2027 school year: grade 12 grads 2027, 11 → 2028, etc.
  return 2027 + (12 - grade);
}

async function nameMap() {
  const rows = await db.select().from(interests);
  return new Map(rows.map((r) => [r.name, r.id]));
}

async function clearTestData() {
  await db.delete(hostStudents).where(like(hostStudents.externalId, "TEST-%"));
  await db.delete(prospectiveStudents).where(like(prospectiveStudents.externalId, "TEST-%"));
}

async function seedHosts(byName: Map<string, string>) {
  for (let i = 0; i < 20; i++) {
    const grade = 9 + (i % 4);
    const gender = i % 2 === 0 ? "M" : "F";
    const dayType = i % 2 === 0 ? "green" : "gold";
    const letters = dayType === "green" ? ["A", "B", "C", "D"] : ["E", "F", "G", "H"];
    const numBlocks = i % 3 === 0 ? 3 : 4; // some hosts have a free period
    const firstName = FIRST[i % FIRST.length];
    const lastName = LAST[i % LAST.length];

    const [host] = await db
      .insert(hostStudents)
      .values({
        externalId: `TEST-H-${i}`,
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`,
        grade,
        gradYear: gradYearFor(grade),
        gender,
      })
      .returning({ id: hostStudents.id });

    // Pick courses for this host's blocks.
    const picked = letters.slice(0, numBlocks).map((letter, k) => {
      const course = COURSES[(i * 3 + k) % COURSES.length];
      return { letter, course };
    });

    const [day] = await db
      .insert(hostScheduleDays)
      .values({ hostStudentId: host.id, date: SHADOW_DATE, dayType })
      .returning({ id: hostScheduleDays.id });

    await db.insert(hostScheduleBlocks).values([
      ...picked.map((p) => ({
        scheduleDayId: day.id,
        blockLabel: `${p.letter} Block`,
        courseTitle: p.course.title,
        courseCode: p.course.code,
        startTime: TIME[p.letter].s,
        endTime: TIME[p.letter].e,
        room: `Room ${100 + ((i + p.letter.charCodeAt(0)) % 40)}`,
        teacher: `${LAST[(i + 3) % LAST.length]}`,
        isAcademic: true,
      })),
      {
        scheduleDayId: day.id,
        blockLabel: "Lunch",
        courseTitle: "Lunch (US)",
        courseCode: null,
        startTime: "13:10:00",
        endTime: "13:50:00",
        room: "Cafeteria",
        teacher: null,
        isAcademic: false,
      },
    ]);

    // Host interests: the subjects they take + a couple of activities.
    const names = new Set<string>(picked.map((p) => p.course.interest));
    names.add(ACTIVITIES[i % ACTIVITIES.length]);
    names.add(ACTIVITIES[(i + 3) % ACTIVITIES.length]);
    const ids = [...names].map((n) => byName.get(n)).filter((x): x is string => !!x);
    if (ids.length) {
      await db
        .insert(hostStudentInterests)
        .values(ids.map((interestId) => ({ hostStudentId: host.id, interestId })))
        .onConflictDoNothing();
    }
  }
  console.log("Hosts: +20 (with schedules + interests) on", SHADOW_DATE);
}

async function seedProspectives(byName: Map<string, string>) {
  for (let j = 0; j < 10; j++) {
    const grade = 9 + (j % 4);
    const gender = j % 2 === 0 ? "M" : "F";
    const firstName = FIRST[(j + 10) % FIRST.length];
    const lastName = LAST[(j + 5) % LAST.length];

    const [p] = await db
      .insert(prospectiveStudents)
      .values({
        externalId: `TEST-P-${j}`,
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`,
        grade,
        gender,
        currentSchool: "Test Middle/High School",
        shadowDate: SHADOW_DATE,
        wantsShadow: true,
        scheduleChoice: "Shadow Visit/Interview",
        interviewDate: SHADOW_DATE,
        interviewStart: "16:00:00",
        interviewEnd: "16:20:00",
        familyEmail: `family${j}@example.com`,
      })
      .returning({ id: prospectiveStudents.id });

    // 1 academic (priority 0) + 4 ranked activities.
    const academic = ACADEMIC_POOL[j % ACADEMIC_POOL.length];
    const acts = [0, 1, 2, 3].map((k) => ACTIVITY_POOL[(j + k) % ACTIVITY_POOL.length]);
    const wanted = [
      { name: academic, priority: 0 },
      ...acts.map((name, k) => ({ name, priority: k + 1 })),
    ];
    const seen = new Set<string>();
    for (const w of wanted) {
      const id = byName.get(w.name);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      await db
        .insert(prospectiveInterests)
        .values({ prospectiveId: p.id, interestId: id, priority: w.priority })
        .onConflictDoNothing();
    }
  }
  console.log("Prospectives: +10 (with ranked interests) on", SHADOW_DATE);
}

async function main() {
  const byName = await nameMap();
  if (byName.size === 0) {
    throw new Error("No interests found — run `npm run db:seed` first.");
  }
  await clearTestData();
  await seedHosts(byName);
  await seedProspectives(byName);
  console.log("Test data seeded. Go to /admin/match?date=" + SHADOW_DATE);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
