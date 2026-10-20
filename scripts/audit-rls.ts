// Read-only audit: for every Supabase project this token can see, report how
// many public tables have RLS off and whether the anon key can actually read
// them. Changes nothing.
//
//   SUPABASE_ACCESS_TOKEN=... npx tsx scripts/audit-rls.ts

export {}; // module scope: these scripts share top-level names

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN is not set");
  process.exit(1);
}

type Project = { id: string; name: string; status: string; region: string };

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.supabase.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`);
  return (await res.json()) as T;
}

async function sql<T>(ref: string, query: string): Promise<T> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`);
  const t = await res.text();
  return (t ? JSON.parse(t) : null) as T;
}

async function main() {
  const projects = await api<Project[]>("/v1/projects");
  console.log(`${projects.length} projects\n`);
  console.log(
    "project".padEnd(26) + "ref".padEnd(22) + "tables".padEnd(8) + "RLS off".padEnd(9) + "anon can read",
  );
  console.log("-".repeat(86));

  for (const p of projects) {
    if (p.status !== "ACTIVE_HEALTHY") {
      console.log(`${p.name.slice(0, 25).padEnd(26)}${p.id.padEnd(22)}(${p.status})`);
      continue;
    }
    let total = 0;
    let off = 0;
    let probe = "—";
    try {
      const rows = await sql<{ total: number; off: number }[]>(
        p.id,
        "select count(*)::int as total, count(*) filter (where not rowsecurity)::int as off from pg_tables where schemaname='public'",
      );
      total = rows[0].total;
      off = rows[0].off;

      if (off > 0) {
        // Find one exposed table and see whether the anon key really returns
        // rows through PostgREST — RLS off only matters if the API serves it.
        const names = await sql<{ tablename: string }[]>(
          p.id,
          "select tablename from pg_tables where schemaname='public' and not rowsecurity order by tablename limit 1",
        );
        const table = names[0]?.tablename;
        const keys = await api<{ name: string; api_key: string }[]>(
          `/v1/projects/${p.id}/api-keys?reveal=true`,
        );
        const anon = keys.find((k) => k.name === "anon")?.api_key;
        if (table && anon) {
          const r = await fetch(
            `https://${p.id}.supabase.co/rest/v1/${table}?select=*`,
            {
              headers: {
                apikey: anon,
                Authorization: `Bearer ${anon}`,
                Prefer: "count=exact",
                Range: "0-0",
              },
            },
          );
          const range = r.headers.get("content-range") ?? "";
          const count = range.split("/")[1] ?? "?";
          probe = r.ok ? `YES — ${table}: ${count} rows` : `no (HTTP ${r.status})`;
        }
      } else {
        probe = "no (RLS on everywhere)";
      }
    } catch (e) {
      probe = `error: ${(e as Error).message.slice(0, 40)}`;
    }
    console.log(
      p.name.slice(0, 25).padEnd(26) +
        p.id.padEnd(22) +
        String(total).padEnd(8) +
        String(off).padEnd(9) +
        probe,
    );
  }
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
