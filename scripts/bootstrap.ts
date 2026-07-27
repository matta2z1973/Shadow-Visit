// Applies drizzle/bootstrap.sql (auth→profiles trigger + backfill).
// Run: npm run db:bootstrap
import "./load-env";
import postgres from "postgres";
import { readFileSync } from "node:fs";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { prepare: false });
  const ddl = readFileSync("drizzle/bootstrap.sql", "utf8");
  await sql.unsafe(ddl);
  console.log("Bootstrap applied (auth→profiles trigger + backfill).");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
