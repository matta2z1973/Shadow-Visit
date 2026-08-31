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
// slots are stuck. `max_lifetime` forces periodic recycling so a connection
// can't quietly accumulate rot across a long-lived warm instance.
//
// This used to be `max: 1`, on the theory that it bounds a stranded
// connection to a single slot. It backfired: several pages (this one
// included) run multiple queries via Promise.all() expecting real
// parallelism, and with only one physical connection postgres-js has no
// choice but to serialize them onto it — so if even one query is slow, the
// wait multiplies across every query queued behind it on that connection,
// compounding into exactly the page-hang symptom this was meant to prevent.
// The actual stranded-connection risk is now bounded by statement_timeout
// and connect_timeout below (which force a stuck connection to fail instead
// of hanging forever), so raising max back up no longer reintroduces that
// problem — it just restores intra-request concurrency.
const client = postgres(connectionString, {
  prepare: false,
  max: 4,
  idle_timeout: 20,
  max_lifetime: 60 * 30,
  // statement_timeout only bounds a query once a connection is established.
  // If establishing the connection itself hangs (e.g. the pooler is
  // unreachable at the TCP level, not just slow to answer queries — seen
  // directly during the 2026-08 us-west-2 Supabase incident), there's
  // nothing to cut that off, and the whole function can ride it out to
  // Vercel's own function-duration ceiling (the 504 FUNCTION_INVOCATION_TIMEOUT
  // page). Bound connection setup explicitly so a dead pooler fails fast
  // instead of silently consuming the entire request budget.
  connect_timeout: 10,
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
