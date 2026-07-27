// Helpers for first/last name handling. We store firstName + lastName and keep
// a composed fullName ("First Last") for display continuity.

export function composeName(
  first?: string | null,
  last?: string | null,
): string {
  return [first, last].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
}

// "First Middle Last" → { first: "First Middle", last: "Last" }
export function splitSpaceName(raw: string): { first: string; last: string } {
  const parts = raw.trim().replace(/\s+/g, " ").split(" ");
  if (parts.length <= 1) return { first: parts[0] ?? "", last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

// "Last, First" → { first: "First", last: "Last" }
export function splitCommaName(raw: string): { first: string; last: string } {
  const idx = raw.indexOf(",");
  if (idx === -1) return splitSpaceName(raw);
  return {
    first: raw.slice(idx + 1).trim(),
    last: raw.slice(0, idx).trim(),
  };
}

// Best-effort split for a fullName of unknown format (comma → "Last, First").
export function splitName(raw: string): { first: string; last: string } {
  return raw.includes(",") ? splitCommaName(raw) : splitSpaceName(raw);
}
