import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  hostStudents,
  prospectiveStudents,
  matchFlags,
  interests,
} from "@/lib/db/schema";
import { desc, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const card =
  "rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950";

export default async function AdminDashboard() {
  await requireAdmin();

  const [[hostCount], [prospCount], [interestCount], [openFlagCount]] =
    await Promise.all([
      db.select({ n: sql<number>`count(*)::int` }).from(hostStudents),
      db.select({ n: sql<number>`count(*)::int` }).from(prospectiveStudents),
      db.select({ n: sql<number>`count(*)::int` }).from(interests),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(matchFlags)
        .where(eq(matchFlags.resolved, false)),
    ]);

  const recentFlags = await db
    .select()
    .from(matchFlags)
    .where(eq(matchFlags.resolved, false))
    .orderBy(desc(matchFlags.createdAt))
    .limit(10);

  const stats = [
    { label: "Host students", value: hostCount.n, href: "/admin/hosts" },
    { label: "Prospective students", value: prospCount.n, href: "/admin/match" },
    { label: "Interests", value: interestCount.n, href: "/admin/interests" },
    { label: "Open flags", value: openFlagCount.n, href: "/admin" },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Admissions dashboard</h1>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className={card}>
            <div className="text-3xl font-semibold">{s.value}</div>
            <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {s.label}
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-3 text-sm">
        <Link href="/admin/uploads" className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
          Upload data
        </Link>
        <Link href="/admin/match" className="rounded-md border border-zinc-300 px-4 py-2 dark:border-zinc-700">
          Run matching
        </Link>
        <Link href="/admin/interests" className="rounded-md border border-zinc-300 px-4 py-2 dark:border-zinc-700">
          Manage interests
        </Link>
        <Link href="/admin/staff" className="rounded-md border border-zinc-300 px-4 py-2 dark:border-zinc-700">
          Staff
        </Link>
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Flags needing attention</h2>
        {recentFlags.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            No open flags.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {recentFlags.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                  {f.type}
                </span>
                <span>{f.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
