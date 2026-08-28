import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Serverless (Vercel) functions get frozen between invocations, and a
// connection that's mid-query when that happens can get stranded — Postgres
// sees it as "active, waiting on the client" forever, since the frozen
// function never resumes to read the result. That ties up a pool slot
// indefinitely and cascades into hangs for every other request once enough
// slots are stuck. `max: 1` bounds the blast radius of a stranded connection
// to a single slot per function instance (Supabase's own recommendation for
// serverless); `max_lifetime` forces periodic recycling so a connection
// can't quietly accumulate rot across a long-lived warm instance.
const client = postgres(connectionString, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
  max_lifetime: 60 * 30,
  // idle_timeout only catches connections sitting genuinely idle — it does
  // nothing for one stuck ACTIVE mid-command (Postgres shows this as waiting
  // on "ClientRead": it finished executing and is waiting to hand results to
  // a client that died without a clean disconnect, e.g. an aborted request
  // or a frozen serverless invocation). Postgres has no default timeout for
  // that case and will wait forever otherwise. statement_timeout bounds the
  // whole command lifecycle, so Postgres force-closes it instead of leaving
  // a pool slot stranded — this is what was hanging the whole site earlier.
  connection: {
    statement_timeout: 30_000,
  },
});

export const db = drizzle(client, { schema });
export { schema };
