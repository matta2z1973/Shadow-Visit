// Admin-remembered column names for the FinalSite prospective report. When
// FinalSite renames a column (it has: Gender → preferred_pronoun), an admin
// picks the new header once on the upload review screen and ticks "remember";
// every later upload reads that field from that header first. Stored as one
// JSON object in app_settings, same pattern as src/lib/schedule/season.ts.
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { REPORT_FIELDS, type ReportFieldKey } from "./parse-prospective-report";
import { normInterestValue } from "./interest-matching";

const KEY = "finalsite_report_columns";
const FIELD_KEYS = new Set<string>(REPORT_FIELDS.map((f) => f.key));

export type SavedColumns = Partial<Record<ReportFieldKey, string>>;

export async function getSavedColumns(): Promise<SavedColumns> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KEY)).limit(1);
  if (!row) return {};
  try {
    const parsed = JSON.parse(row.value) as Record<string, unknown>;
    const out: SavedColumns = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (FIELD_KEYS.has(k) && typeof v === "string" && v.trim()) out[k as ReportFieldKey] = v;
    }
    return out;
  } catch {
    return {};
  }
}

// `changes`: header text to remember for a field, or null to forget it (the
// field goes back to the built-in name rules).
export async function saveColumns(
  changes: Partial<Record<ReportFieldKey, string | null>>,
  // Pass the transaction when saving alongside an import, so the mapping and
  // the data it produced commit or roll back together.
  conn: Pick<typeof db, "select" | "insert"> = db,
): Promise<void> {
  const [row] = await conn.select().from(appSettings).where(eq(appSettings.key, KEY)).limit(1);
  let current: Record<string, string> = {};
  try {
    current = row ? JSON.parse(row.value) : {};
  } catch {
    current = {};
  }
  for (const [k, v] of Object.entries(changes)) {
    if (!FIELD_KEYS.has(k)) continue;
    if (v === null || v === undefined || !v.trim()) delete current[k];
    else current[k] = v.trim();
  }
  const value = JSON.stringify(current);
  await conn
    .insert(appSettings)
    .values({ key: KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}

// ---------------------------------------------------------------------------
// Remembered interest values: FinalSite's interest text → platform interest.
// Keyed by the normalized file text and stored as the interest's *id*, so
// renaming the interest on the platform later doesn't break the link. A
// value of IGNORE_INTEREST means "never import this one".
// ---------------------------------------------------------------------------

const INTEREST_KEY = "finalsite_interest_values";

export type SavedInterestValues = Record<string, string>;

export async function getSavedInterestValues(): Promise<SavedInterestValues> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, INTEREST_KEY)).limit(1);
  if (!row) return {};
  try {
    const parsed = JSON.parse(row.value) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === "string"),
    );
  } catch {
    return {};
  }
}

// `changes`: normalized file text → interest id / IGNORE_INTEREST, or null to
// forget it (the value goes back to automatic matching).
export async function saveInterestValues(
  changes: Record<string, string | null>,
  conn: Pick<typeof db, "select" | "insert"> = db,
): Promise<void> {
  const [row] = await conn.select().from(appSettings).where(eq(appSettings.key, INTEREST_KEY)).limit(1);
  let current: Record<string, string> = {};
  try {
    current = row ? JSON.parse(row.value) : {};
  } catch {
    current = {};
  }
  for (const [k, v] of Object.entries(changes)) {
    const key = normInterestValue(k);
    if (!key) continue;
    if (v === null) delete current[key];
    else current[key] = v;
  }
  const value = JSON.stringify(current);
  await conn
    .insert(appSettings)
    .values({ key: INTEREST_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}
