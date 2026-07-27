// Seeds reference data: interests, the US division + block templates, and
// default app settings. Idempotent-ish (skips interests that already exist).
// Run after migrations:  npm run db:seed
import "./load-env";
import { db } from "../src/lib/db";
import {
  interests,
  divisions,
  blockTemplates,
  appSettings,
} from "../src/lib/db/schema";
import { SEED_INTERESTS } from "../src/lib/seed-interests";
import { US_GREEN_BLOCKS, US_GOLD_BLOCKS } from "../src/lib/schedule/us-blocks";
import { eq } from "drizzle-orm";

async function seedInterests() {
  const existing = await db.select({ name: interests.name }).from(interests);
  const have = new Set(existing.map((e) => e.name));
  const toInsert = SEED_INTERESTS.filter((s) => !have.has(s.name)).map(
    (s, idx) => ({ ...s, sortOrder: idx }),
  );
  if (toInsert.length) await db.insert(interests).values(toInsert);
  console.log(`Interests: +${toInsert.length} (had ${have.size})`);
}

async function seedUsBlocks() {
  let [us] = await db
    .select()
    .from(divisions)
    .where(eq(divisions.code, "US"))
    .limit(1);
  if (!us) {
    [us] = await db
      .insert(divisions)
      .values({ code: "US", label: "Upper School" })
      .returning();
  }
  const already = await db
    .select({ id: blockTemplates.id })
    .from(blockTemplates)
    .where(eq(blockTemplates.divisionId, us.id));
  if (already.length) {
    console.log(`US block templates already present (${already.length}).`);
    return;
  }
  const rows = [
    ...US_GREEN_BLOCKS.map((b, i) => ({
      divisionId: us.id,
      dayType: "green" as const,
      dayNumber: null,
      label: b.label,
      startTime: b.startTime,
      endTime: b.endTime,
      sortOrder: i,
      isAcademic: b.isAcademic,
    })),
    ...US_GOLD_BLOCKS.map((b, i) => ({
      divisionId: us.id,
      dayType: "gold" as const,
      dayNumber: null,
      label: b.label,
      startTime: b.startTime,
      endTime: b.endTime,
      sortOrder: i,
      isAcademic: b.isAcademic,
    })),
  ];
  await db.insert(blockTemplates).values(rows);
  console.log(`US block templates: +${rows.length}`);
}

async function seedSettings() {
  const defaults: Record<string, string> = {
    host_soft_cap: "5",
    interview_minutes: "30",
  };
  for (const [key, value] of Object.entries(defaults)) {
    await db
      .insert(appSettings)
      .values({ key, value })
      .onConflictDoNothing();
  }
  console.log("Settings seeded.");
}

async function main() {
  await seedInterests();
  await seedUsBlocks();
  await seedSettings();
  console.log("Seed complete.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
