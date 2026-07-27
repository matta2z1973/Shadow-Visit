// One-time migration: interests.category enum → text, then recategorize the
// existing rows into the four categories. Idempotent. Run: npm run db:migrate:cats
import "./load-env";
import postgres from "postgres";
import { BY_CATEGORY } from "../src/lib/seed-interests";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { prepare: false, max: 2 });

  // Convert the column off the old enum, then drop the now-unused type.
  await sql.unsafe(
    `ALTER TABLE interests ALTER COLUMN category TYPE text USING category::text;`,
  );
  await sql.unsafe(`DROP TYPE IF EXISTS interest_category;`);

  let updated = 0;
  for (const [category, names] of Object.entries(BY_CATEGORY)) {
    for (const name of names) {
      const res = await sql`update interests set category = ${category} where name = ${name}`;
      updated += res.count;
    }
  }

  const leftover = await sql`
    select name, category from interests
    where category not in ('academics','fine_arts','athletics','innovation')`;

  console.log(`Recategorized ${updated} interests.`);
  if (leftover.length) {
    console.log("Uncategorized (adjust manually in the Interests tab):");
    for (const r of leftover) console.log(`  - ${r.name} (${r.category})`);
  } else {
    console.log("All interests fall into the four categories.");
  }
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
