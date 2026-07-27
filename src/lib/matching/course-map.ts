// Maps a host's course (title/code) to the interest IDs it satisfies.
//
// PLACEHOLDER for Phase 2: this is keyword matching. It will be replaced by the
// course-catalog vector store + LLM ("Engineering" → "Advanced Automation" even
// with no shared words). Keep the signature stable so the swap is localized.

export type InterestRef = { id: string; name: string; category: string };

// Curated synonyms for subjects whose course titles won't contain the interest
// name verbatim. Keyed by the exact seed interest name.
const SYNONYMS: Record<string, string[]> = {
  Math: ["math", "algebra", "geometry", "calculus", "precalculus", "pre-calculus", "trigonometry", "statistics"],
  Science: ["science", "physics", "chemistry", "biology", "anatomy", "physiology", "environmental"],
  English: ["english", "literature", "composition", "writing", "rhetoric"],
  History: ["history", "government", "civics", "geography"],
  "Technology/Innovation": ["technology", "innovation", "computer science", "automation", "robotics", "engineering", "coding", "programming"],
  "Computer Science": ["computer science", "programming", "coding", "software"],
  Engineering: ["engineering", "automation", "robotics"],
  "Automation/Robotics": ["automation", "robotics"],
  "2D/Studio Art": ["studio art", "drawing", "painting", "2d art"],
  "3D Art": ["ceramics", "sculpture", "3d art"],
  Band: ["band", "wind ensemble"],
  Choir: ["choir", "chorus", "vocal"],
  "Chamber Orchestra": ["orchestra", "strings", "chamber"],
  "Drama/Theater": ["theater", "theatre", "drama", "acting"],
  "Technical Theatre": ["technical theatre", "stagecraft", "tech theatre"],
  Photography: ["photography", "photo"],
  Filmmaking: ["film", "filmmaking", "cinema"],
  "Debate/Speech": ["debate", "speech", "forensics"],
  "Human Centered Design": ["human centered design", "design thinking"],
  Dance: ["dance"],
};

const STOP = new Set(["and", "the", "of", "ap", "honors", "advanced", "intro", "introduction", "i", "ii", "iii", "iv"]);

// Build the set of keywords for an interest: curated synonyms, else tokens from
// its own name (split on / , ( ) and spaces; drop generic/stop words).
function keywordsFor(name: string): string[] {
  if (SYNONYMS[name]) return SYNONYMS[name];
  return name
    .toLowerCase()
    .split(/[/()\-,\s]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^(boys|girls)$/.test(w));
}

export function courseCoveredInterestIds(
  courseTitle: string | null,
  courseCode: string | null,
  interests: InterestRef[],
): string[] {
  const hay = `${courseTitle ?? ""} ${courseCode ?? ""}`.toLowerCase();
  if (!hay.trim()) return [];
  const out: string[] = [];
  for (const i of interests) {
    const kws = keywordsFor(i.name);
    if (kws.some((k) => hay.includes(k))) out.push(i.id);
  }
  return out;
}
