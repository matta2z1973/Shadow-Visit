import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// postgres-js has no built-in parser for pgvector's `vector` type. Without
// one registered, it falls back to generic type handling that is
// catastrophically slow specifically for this type: `select * from
// interests` (48 rows, one vector(1536) column) took 2+ minutes end to end
// despite Postgres's own EXPLAIN ANALYZE showing 0.03ms of actual execution
// — confirmed directly: casting the same column to ::text instead made the
// identical query return in 559ms. Every page doing a plain `.select()` on
// `interests`/`courses` (Hosts, Match, Staff, Interests, Settings,
// Hosts/Schedules) was hitting this on every load.
//
// The type's OID is assigned dynamically per database when the extension is
// created, so it isn't a fixed constant across arbitrary databases — but an
// earlier version of this fix looked it up dynamically with a blocking,
// awaited query at module load time, which was itself a bug: that query
// gates every single request this function ever handles (Next.js can't
// start processing a request until the imported module finishes
// initializing), so any bad luck on that one query hangs the *entire*
// function regardless of which page was requested — which is exactly the
// erratic, page-independent hanging pattern that kept showing up even after
// the vector fix landed. Hardcoding it removes that startup query (and the
// extra bootstrap connection) entirely. It's stable for as long as this
// specific database's pgvector extension isn't dropped and recreated; if
// this project is ever migrated again, re-derive it once with:
//   select oid from pg_type where typname = 'vector';
const VECTOR_TYPE_OID = 17174; // shadow-visit-use1 (lqiqowvuvmrotoxtkvyl, us-east-1)

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
  types: {
    vector: {
      to: VECTOR_TYPE_OID,
      from: [VECTOR_TYPE_OID],
      // Pass the raw string straight through in both directions —
      // drizzle-orm's own `vector` column type already has its own
      // string <-> number[] mapper (mapToDriverValue/mapFromDriverValue)
      // and expects to receive/produce a plain Postgres vector literal
      // string. Registering a parser that itself returns a parsed number[]
      // (e.g. via JSON.parse) breaks drizzle: it still runs its own
      // string-parsing logic on whatever comes back, and calling string
      // methods on an already-parsed array throws. All that's actually
      // needed here is to tell postgres-js this OID is a known, ordinary
      // type — that alone is what avoids the slow fallback path for
      // unregistered types; what the parse function does with the value
      // doesn't matter for that.
      serialize: (x: string) => x,
      parse: (x: string) => x,
    },
  },
});

export const db = drizzle(client, { schema });
export { schema };
