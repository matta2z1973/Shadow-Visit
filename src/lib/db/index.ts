import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { after } from "next/server";
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
//
// Then raised again from 4 (2026-08-31): debug-timed logs on /admin/hosts
// (5 concurrent queries via Promise.all) proved the hang isn't tied to any
// particular query or table — reordering the queries moved which one hung
// right along with the reordering. It's whichever queries don't get one of
// the 4 available connections immediately that stall waiting for one to
// free up; one attempt even showed 4 of 5 queries stuck at once, right
// after a rapid prior retry probably hadn't finished freeing its own
// connections yet. Raising the ceiling well above our heaviest concurrent
// batch removes the forced queueing that triggers this.
const client = postgres(connectionString, {
  prepare: false,
  max: 10,
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

// statement_timeout above is sent as a connection *startup parameter*, which
// only reliably applies when Supabase's transaction-mode pooler creates a
// brand-new backend connection for us. When it instead hands back a backend
// it already had (routine under transaction-mode pooling, which multiplexes
// many logical clients over a smaller shared set of real connections), we
// inherit whatever statement_timeout that backend happened to be configured
// with by whoever used it before us — not the one we asked for. Confirmed
// directly: a plain `select * from host_students` was cancelled after
// 294ms despite our client requesting a 30s timeout, and on other requests
// the same query hung with no timeout enforcement at all. Both are
// symptoms of the same mechanism, and it explains the erratic
// fast/cancelled-early/hangs-forever pattern across today far better than
// any single query or table being slow.
//
// Fix: stop trusting server-side session state and enforce the timeout
// entirely on our own side instead, where it can't be affected by whatever
// a shared, reused connection happens to carry. `client.unsafe` is the one
// method drizzle-orm's postgres-js driver calls for every query it runs
// (see node_modules/drizzle-orm/postgres-js/session.cjs), so wrapping it
// here covers every query in the app without needing to touch individual
// call sites. Overriding `.then` in place (rather than replacing the
// returned object) preserves chained calls like `.values()` that
// drizzle's typed-select path relies on — verified directly: a normal
// select, an artificial pg_sleep(10) that correctly times out instead of
// hanging, and a further select afterward to confirm the connection isn't
// left in a broken state, all behave correctly with this wrapper in place.
//
// IMPORTANT: giving up on the *promise* via Promise.race does not give up on
// the *connection*. postgres-js's pool (max: 4 above) considers a connection
// busy until the query it's running actually completes or errors — our race
// just stops awaiting it, it doesn't touch the connection at all. If the
// underlying query is truly stuck (the ClientRead-forever state we've seen
// directly in pg_stat_activity), that connection is gone from the pool of 4
// permanently. Confirmed live: after Hosts hit this timeout, the *next*
// unrelated page (the dashboard) started timing out too — the pool was
// quietly shrinking by one lost connection per timeout until nothing was
// left to serve any request. postgres-js's Query objects expose a real
// `.cancel()` (see node_modules/postgres/cjs/src/query.js and the `cancel()`
// function in index.js) that opens a side connection and sends an actual
// PostgreSQL CancelRequest for the specific backend running our query —
// this is what actually frees the original connection back to the pool,
// rather than merely abandoning it. Fire-and-forget (don't await it here) so
// a slow/failed cancel can't extend the 20s our own caller already waited.
const QUERY_TIMEOUT_MS = 20_000;
const originalUnsafe = client.unsafe.bind(client);
client.unsafe = ((...args: Parameters<typeof originalUnsafe>) => {
  const query = originalUnsafe(...args);
  const originalThen = query.then.bind(query);
  query.then = ((onFulfilled?: unknown, onRejected?: unknown) => {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => {
        // query.cancel() (see node_modules/postgres/cjs/src/query.js) fires
        // `this.canceller(this)` — the actual cancel-request promise, which
        // opens a side connection and sends a real PostgreSQL CancelRequest
        // — but then discards that promise via a comma expression and
        // returns null/false instead of it. Verified in isolation (a local,
        // long-running script against this same database) that calling
        // cancel() this way does free the connection. But in production,
        // pg_stat_activity kept showing these exact queries still "active"
        // a minute-plus after their 20s timeout supposedly cancelled them —
        // the difference is that a Vercel serverless function is free to
        // freeze its execution environment the instant our response is
        // sent, which can cut the cancel's own fire-and-forget network
        // round trip off mid-flight before it ever reaches Postgres. A
        // local script has no such deadline, which is why the isolated
        // test looked fine.
        //
        // Fix: grab the real promise ourselves (query.canceller is the same
        // function `cancel()` calls, just not exposed by the public method)
        // and hand it to Next's after() — after() keeps this function alive
        // just long enough for that promise to settle, without delaying the
        // response the way actually awaiting it here would.
        try {
          const canceller = (query as unknown as { canceller: ((q: unknown) => Promise<unknown>) | null }).canceller;
          if (canceller) {
            (query as unknown as { canceller: unknown }).canceller = null;
            after(() => canceller(query).catch(() => {}));
          }
        } catch (cancelErr) {
          console.error("client.unsafe timeout: failed to schedule query cancellation", cancelErr);
        }
        reject(new Error(`Query timed out after ${QUERY_TIMEOUT_MS}ms (client-side)`));
      }, QUERY_TIMEOUT_MS),
    );
    return Promise.race([new Promise(originalThen), timeout]).then(
      onFulfilled as never,
      onRejected as never,
    );
  }) as typeof query.then;
  return query;
}) as typeof client.unsafe;

export const db = drizzle(client, { schema });
export { schema };
