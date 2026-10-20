// Enables Row-Level Security on every table in the `public` schema of a
// Supabase project, and removes TRUNCATE from the anonymous roles.
//
// WHY THIS IS SAFE FOR THIS APP, AND WHY YOU MUST CHECK BEFORE REUSING IT:
//
// Supabase exposes every table in `public` through PostgREST at
// <ref>.supabase.co/rest/v1/<table>, authorised by the anon key — which is
// NEXT_PUBLIC and therefore shipped inside the browser bundle of a public
// site. With RLS off and the default grants in place, that key is read AND
// write access to everything, to anyone who views source.
//
// Enabling RLS with no policies denies anon and authenticated outright.
// It does not affect this app because:
//
//   * the app never calls supabase.from() — the Supabase client is used
//     only for auth (signInWithOtp / verifyOtp / getUser / signOut)
//   * all data access goes through Drizzle over DATABASE_URL as the
//     `postgres` role, which owns every table and has rolbypassrls = true
//
// If you point this at a project whose app DOES read through PostgREST
// (supabase.from(...), the JS data client, Realtime), this will break it
// until you write policies. Check first.
//
// TRUNCATE is revoked separately: RLS policies are not applied to TRUNCATE,
// so enabling RLS alone would leave that privilege usable.
//
// Usage:
//   SUPABASE_ACCESS_TOKEN=... npx tsx scripts/enable-rls.ts <project-ref> [--apply]
// Without --apply it only reports what it would do.

const ref = process.argv[2];
const apply = process.argv.includes("--apply");

if (!ref) {
  console.error("usage: npx tsx scripts/enable-rls.ts <project-ref> [--apply]");
  process.exit(1);
}
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN is not set");
  process.exit(1);
}

async function sql<T = unknown>(query: string): Promise<T> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 400)}`);
  return (text ? JSON.parse(text) : null) as T;
}

type TableRow = { tablename: string; rowsecurity: boolean; tableowner: string };

async function main() {
  const tables = await sql<TableRow[]>(
    "select tablename, rowsecurity, tableowner from pg_tables where schemaname = 'public' order by tablename",
  );
  const off = tables.filter((t) => !t.rowsecurity);

  console.log(`project ${ref}: ${tables.length} tables in public, ${off.length} without RLS`);

  // Refuse if anything is owned by a role other than postgres — the
  // bypassrls guarantee the app depends on would not hold.
  const foreign = tables.filter((t) => t.tableowner !== "postgres");
  if (foreign.length) {
    console.error(
      `REFUSING: these tables are not owned by postgres, so enabling RLS could lock the app out: ${foreign
        .map((t) => `${t.tablename} (${t.tableowner})`)
        .join(", ")}`,
    );
    process.exit(1);
  }

  if (!off.length) {
    console.log("Nothing to do — RLS already enabled everywhere.");
  } else if (!apply) {
    console.log("\nWould enable RLS on:");
    for (const t of off) console.log(`  ${t.tablename}`);
    console.log("\nRe-run with --apply to make the change.");
    return;
  } else {
    for (const t of off) {
      await sql(`alter table public."${t.tablename}" enable row level security;`);
      console.log(`  RLS on   ${t.tablename}`);
    }
    // RLS does not govern TRUNCATE; the privilege has to go.
    await sql(
      "revoke truncate on all tables in schema public from anon, authenticated;",
    );
    console.log("  revoked TRUNCATE from anon, authenticated");
  }

  const after = await sql<{ rls_off: number }[]>(
    "select count(*) filter (where not rowsecurity)::int as rls_off from pg_tables where schemaname='public'",
  );
  const policies = await sql<{ n: number }[]>(
    "select count(*)::int as n from pg_policies where schemaname='public'",
  );
  console.log(
    `\nafter: ${after[0].rls_off} tables still without RLS, ${policies[0].n} policies defined`,
  );
  console.log(
    "0 policies is correct here: with RLS on and no policy, anon and authenticated are denied everything, while the owner role the app uses bypasses RLS.",
  );
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
