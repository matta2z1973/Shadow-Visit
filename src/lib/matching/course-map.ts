// Maps a host's course (title/code) to the interest IDs it satisfies.
//
// Two layers, unioned together:
// 1. Keyword matching (below) — cheap, deterministic, always on.
// 2. Semantic matching via course-catalog embeddings — catches things
//    keywords miss (e.g. "Engineering" interest -> "Advanced Automation"
//    course, no shared words). Only active once an admin has uploaded a
//    course catalog and configured an OpenAI key on /admin/settings; the
//    `semantic` param is optional so this stays pure and degrades cleanly
//    to keyword-only otherwise. Building the semantic context (embedding
//    lookups, catalog resolution) is the caller's job — see
//    src/lib/matching/loader.ts — so this file stays DB/API-free and
//    testable in isolation.

import { cosineSimilarity } from "@/lib/llm/embeddings";

export type InterestRef = { id: string; name: string; category: string };

export type CourseCatalogEntry = {
  code: string | null;
  title: string;
  embedding: number[] | null;
};

export type SemanticMatchContext = {
  catalog: CourseCatalogEntry[];
  interestEmbeddings: Map<string, number[]>; // interestId -> embedding
};

// Cosine similarity cutoff above which a course is judged to cover an
// interest semantically. Tuned conservatively — false negatives (missing a
// real match) are cheaper than false positives (a class that doesn't
// actually cover the interest).
const SIMILARITY_THRESHOLD = 0.32;

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

function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Resolve a host's scheduled course to a catalog entry: exact code match
// first (most reliable), then exact normalized-title match, then a loose
// substring match either direction (course codes/titles from ICS feeds are
// often abbreviated or suffixed with section numbers).
function findCatalogEntry(
  courseTitle: string | null,
  courseCode: string | null,
  catalog: CourseCatalogEntry[],
): CourseCatalogEntry | null {
  if (courseCode) {
    const code = courseCode.trim().toLowerCase();
    const hit = catalog.find((c) => c.code?.trim().toLowerCase() === code);
    if (hit) return hit;
  }
  if (courseTitle) {
    const norm = normalizeTitle(courseTitle);
    if (norm) {
      const exact = catalog.find((c) => normalizeTitle(c.title) === norm);
      if (exact) return exact;
      const fuzzy = catalog.find((c) => {
        const cn = normalizeTitle(c.title);
        return cn.length >= 4 && (norm.includes(cn) || cn.includes(norm));
      });
      if (fuzzy) return fuzzy;
    }
  }
  return null;
}

export function courseCoveredInterestIds(
  courseTitle: string | null,
  courseCode: string | null,
  interests: InterestRef[],
  semantic?: SemanticMatchContext,
): string[] {
  const hay = `${courseTitle ?? ""} ${courseCode ?? ""}`.toLowerCase();
  const out = new Set<string>();

  if (hay.trim()) {
    for (const i of interests) {
      const kws = keywordsFor(i.name);
      if (kws.some((k) => hay.includes(k))) out.add(i.id);
    }
  }

  if (semantic && (courseTitle || courseCode)) {
    const entry = findCatalogEntry(courseTitle, courseCode, semantic.catalog);
    if (entry?.embedding) {
      for (const i of interests) {
        if (out.has(i.id)) continue;
        const interestEmbedding = semantic.interestEmbeddings.get(i.id);
        if (!interestEmbedding) continue;
        if (cosineSimilarity(entry.embedding, interestEmbedding) >= SIMILARITY_THRESHOLD) {
          out.add(i.id);
        }
      }
    }
  }

  return [...out];
}
