// Matches the interest names in a FinalSite report to the platform's
// interests. Pure — no DB — so it's testable and the rules live in one place.
//
// FinalSite and the platform name the same thing differently, and both sides
// drift: FinalSite sends "Soccer (boys/girls)" while production renamed its
// interest to "Soccer"; production also has "Cross Country (boys and girls)"
// next to "Cheerleading (boys/girls)". So after an exact name match, names are
// compared with team-gender wording and punctuation stripped, then by word
// containment. A guess is only made when exactly one interest fits.

export type InterestRef = { id: string; name: string };

// What the admin picked for a file value on the review screen ("" = automatic).
export const IGNORE_INTEREST = "__ignore__";

export type InterestMatchSource = "chosen" | "saved" | "exact" | "fuzzy" | "ignored" | null;

export type InterestMatch = { interestId: string | null; source: InterestMatchSource };

// Words that describe who plays, not what the activity is.
const NOISE_WORDS = new Set([
  "boys", "boy", "girls", "girl", "men", "mens", "women", "womens", "male", "female",
  "coed", "co", "ed", "and", "varsity", "jv", "junior", "team",
]);

export function normInterestValue(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/['’]/g, "") // girls' / women's → girls / womens
    .replace(/&/g, " and ")
    .replace(/theatre/g, "theater")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !NOISE_WORDS.has(w));
}

export function fuzzyInterestKey(s: string): string {
  return words(s).join(" ");
}

export function matchInterestValue(
  value: string,
  all: InterestRef[],
  opts: {
    chosen?: string; // this upload's pick: interest id, IGNORE_INTEREST, or "" / undefined
    saved?: string; // remembered pick, same shape
  } = {},
): InterestMatch {
  const byId = new Set(all.map((i) => i.id));
  for (const [pick, source] of [
    [opts.chosen, "chosen"],
    [opts.saved, "saved"],
  ] as const) {
    if (!pick) continue;
    if (pick === IGNORE_INTEREST) return { interestId: null, source: "ignored" };
    // A remembered interest that was since deleted falls through to the rules.
    if (byId.has(pick)) return { interestId: pick, source };
  }

  const norm = normInterestValue(value);
  const exact = all.find((i) => normInterestValue(i.name) === norm);
  if (exact) return { interestId: exact.id, source: "exact" };

  const key = fuzzyInterestKey(value);
  if (!key) return { interestId: null, source: null };
  const sameKey = all.filter((i) => fuzzyInterestKey(i.name) === key);
  if (sameKey.length === 1) return { interestId: sameKey[0].id, source: "fuzzy" };
  if (sameKey.length > 1) return { interestId: null, source: null };

  // Word containment either way: "Robotics" ↔ "Automation/Robotics".
  const valueWords = new Set(key.split(" "));
  const contained = all.filter((i) => {
    const w = fuzzyInterestKey(i.name).split(" ").filter(Boolean);
    if (!w.length) return false;
    const iSet = new Set(w);
    return w.every((x) => valueWords.has(x)) || [...valueWords].every((x) => iSet.has(x));
  });
  if (contained.length === 1) return { interestId: contained[0].id, source: "fuzzy" };
  return { interestId: null, source: null };
}
