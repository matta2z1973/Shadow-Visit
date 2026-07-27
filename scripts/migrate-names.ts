// One-time migration: add first_name/last_name columns to the name-bearing
// tables and backfill them by splitting the existing full_name. Also normalizes
// full_name to "First Last". Idempotent. Run: npm run db:migrate:names
import "./load-env";
import postgres from "postgres";
import { splitName, composeName } from "../src/lib/names";

const TABLES = ["profiles", "host_students", "prospective_students", "staff"];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { prepare: false, max: 2 });

  for (const t of TABLES) {
    await sql.unsafe(
      `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS first_name text;
       ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS last_name text;`,
    );
  }

  let total = 0;
  for (const t of TABLES) {
    // Only backfill rows that don't have a first_name yet.
    const rows = await sql.unsafe(
      `select id, full_name from ${t} where first_name is null and full_name is not null`,
    );
    for (const r of rows as unknown as { id: string; full_name: string }[]) {
      const { first, last } = splitName(r.full_name);
      const full = composeName(first, last) || r.full_name;
      await sql.unsafe(
        `update ${t} set first_name = $1, last_name = $2, full_name = $3 where id = $4`,
        [first || null, last || null, full, r.id],
      );
      total++;
    }
  }

  console.log(`Added columns and backfilled ${total} rows across ${TABLES.join(", ")}.`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
