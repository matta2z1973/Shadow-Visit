// Pure matching logic — no DB imports, so it can be unit-tested directly.
//
// Hard constraints: grade must match, gender must match. Everything else is a
// weighted score. Host load is a *soft* cap: going over it costs points and
// raises a flag, but doesn't disqualify.

import { academicLettersFor } from "@/lib/schedule/us-blocks";

export type MatchInterest = { interestId: string; priority: number }; // 1 = highest

export type HostForMatch = {
  hostStudentId: string;
  fullName: string;
  grade: number | null;
  gender: "M" | "F" | null;
  interestIds: string[]; // self-selected interests
  dayType: "green" | "gold" | null;
  // Academic classes the host has on the shadow date.
  academicBlocks: {
    blockLabel: string; // "E Block"
    courseTitle: string | null;
    courseCode: string | null;
    // interestIds this course is judged to satisfy (from catalog mapping / keyword).
    coveredInterestIds: string[];
  }[];
  currentVisitCount: number; // confirmed shadow assignments so far this term/year
};

export type ProspectiveForMatch = {
  prospectiveId: string;
  grade: number | null;
  gender: "M" | "F" | null;
  interests: MatchInterest[]; // up to 4, in priority order
};

export type MatchOptions = {
  hostSoftCap: number; // e.g. 5 visits per host
};

export type InterestCoverage = {
  interestId: string;
  priority: number;
  covered: boolean;
  via: "host_class" | "host_interest" | null;
  blockLabel: string | null; // which class covers it, if any
};

export type HostScore = {
  hostStudentId: string;
  fullName: string;
  score: number;
  freePeriodCount: number;
  coverage: InterestCoverage[];
  coveredCount: number;
  overCap: boolean;
  flags: { type: string; message: string }[];
};

// Priority 1 is worth the most. p1=4, p2=3, p3=2, p4=1.
export function priorityWeight(priority: number): number {
  return Math.max(1, 5 - priority);
}

// Academic slots the host has no class in, out of the 4 for that day-type.
export function computeFreePeriods(host: HostForMatch): number {
  if (!host.dayType) return 0;
  const letters = academicLettersFor(host.dayType);
  const present = new Set(
    host.academicBlocks.map((b) => b.blockLabel.trim().charAt(0).toUpperCase()),
  );
  return letters.filter((l) => !present.has(l)).length;
}

function coverInterest(
  host: HostForMatch,
  mi: MatchInterest,
): InterestCoverage {
  // Prefer coverage by an actual class the prospective would see that day.
  for (const b of host.academicBlocks) {
    if (b.coveredInterestIds.includes(mi.interestId)) {
      return {
        interestId: mi.interestId,
        priority: mi.priority,
        covered: true,
        via: "host_class",
        blockLabel: b.blockLabel,
      };
    }
  }
  // Otherwise, the host simply shares the interest (activities/athletics etc.).
  if (host.interestIds.includes(mi.interestId)) {
    return {
      interestId: mi.interestId,
      priority: mi.priority,
      covered: true,
      via: "host_interest",
      blockLabel: null,
    };
  }
  return {
    interestId: mi.interestId,
    priority: mi.priority,
    covered: false,
    via: null,
    blockLabel: null,
  };
}

const FREE_PERIOD_PENALTY = 3;
const OVER_CAP_PENALTY = 10;

export function scoreHost(
  prospective: ProspectiveForMatch,
  host: HostForMatch,
  opts: MatchOptions,
): HostScore | null {
  // Hard constraints.
  if (prospective.grade !== null && host.grade !== null) {
    if (prospective.grade !== host.grade) return null;
  }
  if (prospective.gender !== null && host.gender !== null) {
    if (prospective.gender !== host.gender) return null;
  }

  const coverage = prospective.interests.map((mi) => coverInterest(host, mi));
  const coveredCount = coverage.filter((c) => c.covered).length;

  let score = 0;
  for (const c of coverage) {
    if (!c.covered) continue;
    // A class the student actually sees during the visit is worth
    // meaningfully more than just sharing a hobby with the host.
    const viaBonus = c.via === "host_class" ? 2 : 0;
    score += priorityWeight(c.priority) * 2 + viaBonus;
  }

  const freePeriodCount = computeFreePeriods(host);
  score -= freePeriodCount * FREE_PERIOD_PENALTY;

  const overCap = host.currentVisitCount >= opts.hostSoftCap;
  if (overCap) score -= OVER_CAP_PENALTY;
  // Gentle tie-breaker toward less-used hosts even under the cap.
  score -= host.currentVisitCount;

  const flags: { type: string; message: string }[] = [];
  if (overCap) {
    flags.push({
      type: "host_over_cap",
      message: `${host.fullName} is at/over the soft cap (${host.currentVisitCount}/${opts.hostSoftCap}).`,
    });
  }
  if (freePeriodCount > 1) {
    flags.push({
      type: "excess_free_periods",
      message: `${freePeriodCount} free periods with this host (target ≤ 1).`,
    });
  }
  // Uncovered top-1/top-2 interests → candidate for a faculty subject meeting.
  for (const c of coverage) {
    if (!c.covered && c.priority <= 2) {
      flags.push({
        type: "uncovered_interest",
        message: `Priority ${c.priority} interest not covered by host classes — consider a faculty meeting.`,
      });
    }
  }

  return {
    hostStudentId: host.hostStudentId,
    fullName: host.fullName,
    score,
    freePeriodCount,
    coverage,
    coveredCount,
    overCap,
    flags,
  };
}

export type RankedMatch = {
  prospectiveId: string;
  ranked: HostScore[]; // best first
  best: HostScore | null;
  noGradeOrGenderMatch: boolean;
};

// Rank all eligible hosts for one prospective.
export function rankHosts(
  prospective: ProspectiveForMatch,
  hosts: HostForMatch[],
  opts: MatchOptions,
): RankedMatch {
  const scored = hosts
    .map((h) => scoreHost(prospective, h, opts))
    .filter((s): s is HostScore => s !== null);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.freePeriodCount !== b.freePeriodCount)
      return a.freePeriodCount - b.freePeriodCount;
    return b.coveredCount - a.coveredCount;
  });

  return {
    prospectiveId: prospective.prospectiveId,
    ranked: scored,
    best: scored[0] ?? null,
    noGradeOrGenderMatch: scored.length === 0,
  };
}

// Greedy bulk assignment: process prospectives in order, assign each its best
// available host, incrementing that host's visit count so load spreads out.
export function assignBulk(
  prospectives: ProspectiveForMatch[],
  hosts: HostForMatch[],
  opts: MatchOptions,
): RankedMatch[] {
  const liveCounts = new Map(hosts.map((h) => [h.hostStudentId, h.currentVisitCount]));
  const results: RankedMatch[] = [];

  for (const p of prospectives) {
    const adjustedHosts = hosts.map((h) => ({
      ...h,
      currentVisitCount: liveCounts.get(h.hostStudentId) ?? h.currentVisitCount,
    }));
    const ranked = rankHosts(p, adjustedHosts, opts);
    if (ranked.best) {
      const id = ranked.best.hostStudentId;
      liveCounts.set(id, (liveCounts.get(id) ?? 0) + 1);
    }
    results.push(ranked);
  }
  return results;
}
