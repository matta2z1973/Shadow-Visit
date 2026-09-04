// A small curated catalog used ONLY for the "TestHost" practice hosts —
// distinct from the real, admin-uploaded AI-matching course catalog
// (src/lib/db/schema.ts `courses` table), which has no category/grade
// structure to group by. Pure constants (no DB import) so both the test-host
// server actions and the client-side editor can import it directly.
//
// Titles are picked to keyword-match the corresponding interest via
// src/lib/matching/course-map.ts (either a curated synonym, e.g. "algebra"
// -> Math, or — for Chinese/Latin/Spanish, which have no curated synonym
// list — the interest's own name, which the matcher falls back to tokenizing
// directly, e.g. "Spanish I" contains "spanish").
export type CourseCategory =
  | "english"
  | "language"
  | "math"
  | "science"
  | "history"
  | "arts"
  | "innovation";

export const COURSE_CATEGORIES: { slug: CourseCategory; label: string }[] = [
  { slug: "english", label: "English" },
  { slug: "language", label: "Language" },
  { slug: "math", label: "Math" },
  { slug: "science", label: "Science" },
  { slug: "history", label: "History" },
  { slug: "arts", label: "Arts" },
  { slug: "innovation", label: "Innovation" },
];

export const TEST_COURSE_CATALOG: Record<CourseCategory, string[]> = {
  english: ["English 9", "English 10", "English 11", "English 12", "American Literature", "British Literature"],
  language: [
    "Spanish I", "Spanish II", "Spanish III", "Spanish IV",
    "Chinese I", "Chinese II", "Chinese III", "Chinese IV",
    "Latin I", "Latin II", "Latin III", "Latin IV",
  ],
  math: ["Algebra I", "Geometry", "Algebra II", "Precalculus", "Calculus", "Statistics"],
  science: ["Biology", "Chemistry", "Physics", "Anatomy & Physiology", "Environmental Science"],
  history: ["World History I", "World History II", "US History", "Government & Economics"],
  arts: ["Studio Art", "Theater Arts", "Band", "Choir", "Photography", "Filmmaking", "Chamber Orchestra", "Dance"],
  innovation: ["Computer Science A", "Advanced Automation", "Entrepreneurship", "Human Centered Design"],
};

// Sensible grade-specific defaults for the 5 required categories. Arts and
// Innovation have none — those two are randomized regardless of grade.
const GRADE_DEFAULT_COURSE: Partial<Record<CourseCategory, Record<number, string>>> = {
  english: { 9: "English 9", 10: "English 10", 11: "English 11", 12: "English 12" },
  language: { 9: "Spanish I", 10: "Spanish II", 11: "Spanish III", 12: "Spanish IV" },
  math: { 9: "Algebra I", 10: "Geometry", 11: "Algebra II", 12: "Precalculus" },
  science: { 9: "Biology", 10: "Chemistry", 11: "Physics", 12: "Anatomy & Physiology" },
  history: { 9: "World History I", 10: "World History II", 11: "US History", 12: "Government & Economics" },
};

export const BLOCK_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
export type BlockLetter = (typeof BLOCK_LETTERS)[number];

export function dayTypeForLetter(letter: BlockLetter): "green" | "gold" {
  return (["A", "B", "C", "D"] as string[]).includes(letter) ? "green" : "gold";
}

// Which category each letter defaults to when generating a fresh test host —
// 4 required categories on the green-day blocks, the other 2 required plus
// the 2 randomized ones on gold, with H left as the required free block.
const DEFAULT_LETTER_CATEGORY: Record<BlockLetter, CourseCategory | null> = {
  A: "english",
  B: "language",
  C: "math",
  D: "science",
  E: "history",
  F: "arts",
  G: "innovation",
  H: null, // free block
};

export type TestHostBlockInput = {
  letter: BlockLetter;
  courseTitle: string | null; // null = free block
};

// Exactly 7 courses (one per category, at least 1 each of math/science/
// history/english/language, the rest randomized) + 1 free block, spanning
// both green (A-D) and gold (E-H) blocks so a test host actually has
// something to show on either day type.
export function defaultBlocksForGrade(grade: number): TestHostBlockInput[] {
  return BLOCK_LETTERS.map((letter) => {
    const category = DEFAULT_LETTER_CATEGORY[letter];
    if (!category) return { letter, courseTitle: null };
    const graded = GRADE_DEFAULT_COURSE[category]?.[grade];
    if (graded) return { letter, courseTitle: graded };
    const options = TEST_COURSE_CATALOG[category];
    const pick = options[Math.floor(Math.random() * options.length)];
    return { letter, courseTitle: pick };
  });
}
