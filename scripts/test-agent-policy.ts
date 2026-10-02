import { canRead, canWrite } from "../src/lib/agent/repo";

const cases: [string, boolean, boolean][] = [
  // path,                                   canRead, canWrite
  ["src/app/globals.css",                     true,  true],
  ["src/app/admin/hosts/hosts-table.tsx",     true,  true],
  ["src/components/site-nav.tsx",             true,  true],
  ["src/lib/matching/engine.ts",              true,  true],
  ["public/help/calendar-link.html",          true,  true],
  ["README.md",                               true,  false], // readable, not writable
  // --- must be refused ---
  ["src/lib/agent/tools.ts",                  false, false], // self-modification
  ["src/lib/agent/repo.ts",                   false, false], // this policy itself
  ["src/lib/agent/system-prompt.ts",          false, false],
  ["src/lib/auth.ts",                         false, false],
  ["src/lib/sandbox.ts",                      false, false],
  ["src/lib/supabase/server.ts",              false, false],
  ["src/proxy.ts",                            false, false],
  ["src/app/login/page.tsx",                  false, false],
  ["src/app/auth/callback/route.ts",          false, false],
  ["src/lib/db/schema.ts",                    false, false],
  ["drizzle/bootstrap.sql",                   false, false],
  [".env.local",                              false, false],
  ["package.json",                            false, false],
  ["next.config.ts",                          false, false],
  [".github/workflows/deploy.yml",            false, false],
  ["src/../.env.local",                       false, false], // traversal
  ["src/app/../lib/agent/tools.ts",           false, false],
];

let fail = 0;
for (const [p, wantRead, wantWrite] of cases) {
  const r = canRead(p).allowed, w = canWrite(p).allowed;
  const ok = r === wantRead && w === wantWrite;
  if (!ok) fail++;
  console.log(`${ok ? "pass" : "FAIL"}  read=${String(r).padEnd(5)} write=${String(w).padEnd(5)}  ${p}`);
}
console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
