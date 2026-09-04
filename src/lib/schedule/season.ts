// The shadow-visit season: the date range schedule syncing and test-host
// data apply to. Stored in the existing app_settings key/value table, same
// pattern as src/lib/llm/settings.ts.
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";

const KEY_START = "shadow_season_start";
const KEY_END = "shadow_season_end";

export type ShadowSeason = { start: string; end: string }; // "YYYY-MM-DD"

export async function getShadowSeason(): Promise<ShadowSeason | null> {
  const all = await db.select().from(appSettings);
  const map = new Map(all.map((r) => [r.key, r.value]));
  const start = map.get(KEY_START);
  const end = map.get(KEY_END);
  if (!start || !end) return null;
  return { start, end };
}

async function upsert(key: string, value: string) {
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function saveShadowSeason(season: ShadowSeason): Promise<void> {
  await upsert(KEY_START, season.start);
  await upsert(KEY_END, season.end);
}
