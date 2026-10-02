export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Safety net for the 2026-08 Supabase us-west-2 incident: several DB
  // calls across the app aren't individually wrapped in try/catch (two
  // confirmed ones already are, in src/lib/auth.ts and
  // src/app/login/actions.ts), and a stalled/cancelled query occasionally
  // surfaces as a raw unhandled rejection from postgres-js's socket
  // handling rather than a normal awaited-promise rejection our own
  // try/catch blocks would see. Left unhandled, Node kills the whole
  // serverless process — which cuts off whatever else that process was
  // mid-way through streaming, producing the "header loaded, rest of the
  // page permanently blank" symptom, not just a failure for the one
  // request that actually hit the DB error. Log and continue instead of
  // crashing; the one request that triggered it still fails/times out
  // normally, but it no longer takes every other concurrent request on
  // that instance down with it.
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled rejection (contained, not crashing process):", reason);
  });

  // Verify PG_VECTOR_TYPE_OID actually matches this database. A wrong value
  // fails silently — no error, just the catastrophically slow unregistered-
  // type path that once made `select * from interests` take two minutes (see
  // src/lib/db/index.ts) — so it's worth one query to catch it.
  //
  // Deliberately NOT awaited. An awaited query at module-init gates every
  // request the function will ever serve, which is itself a bug this project
  // has already been bitten by (the dynamic OID lookup that used to live in
  // db/index.ts hung the whole function regardless of which page was asked
  // for). Fire-and-forget with its own timeout: if it can't answer quickly,
  // we lose the check, not the deployment.
  void (async () => {
    try {
      const { db } = await import("@/lib/db");
      const { sql } = await import("drizzle-orm");
      const expected = Number(process.env.PG_VECTOR_TYPE_OID ?? 17174);
      const rows = (await Promise.race([
        db.execute(sql`select oid::int as oid from pg_type where typname = 'vector'`),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("vector OID probe timed out")), 8_000),
        ),
      ])) as { oid: number }[];
      const actual = rows?.[0]?.oid;
      if (actual == null) {
        console.warn("[startup] pgvector not installed in this database — vector columns will misbehave.");
      } else if (actual !== expected) {
        console.error(
          `[startup] PG_VECTOR_TYPE_OID MISMATCH: configured ${expected}, database reports ${actual}. ` +
            `Vector queries will take the slow fallback path. Set PG_VECTOR_TYPE_OID=${actual} for this environment.`,
        );
      } else {
        console.log(`[startup] pgvector OID ${actual} matches configuration.`);
      }
    } catch (err) {
      console.warn("[startup] could not verify pgvector OID:", err instanceof Error ? err.message : err);
    }
  })();
}
