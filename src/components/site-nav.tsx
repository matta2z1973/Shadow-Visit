import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { viewAsStudent, viewAsAdmin } from "@/app/view-as-actions";

const linkCls =
  "text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100";

export default async function SiteNav() {
  const user = await getCurrentUser();
  if (!user) return null;

  const isAdmin = user.role === "admin";

  return (
    <nav className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
        <Link
          href="/"
          className="mr-3 flex items-center gap-2 border-zinc-200 pr-4 dark:border-zinc-800 sm:border-r"
        >
          <span
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-800 text-xs font-bold leading-none text-white shadow-sm"
          >
            SV
          </span>
          <span className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Shadow Visit
          </span>
        </Link>

        <div className="flex items-center gap-4 text-sm">
          {isAdmin ? (
            <>
              <Link href="/admin" className={linkCls}>
                Dashboard
              </Link>
              <Link href="/admin/uploads" className={linkCls}>
                Uploads
              </Link>
              <Link href="/admin/match" className={linkCls}>
                Match
              </Link>
              <Link href="/admin/prospectives" className={linkCls}>
                Prospectives
              </Link>
              <Link href="/admin/hosts" className={linkCls}>
                Hosts
              </Link>
              <Link href="/admin/interests" className={linkCls}>
                Interests
              </Link>
              <Link href="/admin/staff" className={linkCls}>
                Staff
              </Link>
              <Link href="/admin/availability" className={linkCls}>
                Availability
              </Link>
            </>
          ) : (
            <Link href="/me" className={linkCls}>
              My interests
            </Link>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
          <span className="hidden sm:inline">{user.fullName ?? user.email}</span>
          {isAdmin ? (
            <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
              admin
            </span>
          ) : null}
          {user.actualRole === "admin" ? (
            isAdmin ? (
              <form action={viewAsStudent}>
                <button
                  type="submit"
                  className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                >
                  View as student
                </button>
              </form>
            ) : (
              <form action={viewAsAdmin}>
                <button
                  type="submit"
                  className="rounded bg-amber-500 px-2 py-1 text-xs font-medium text-white hover:bg-amber-600"
                >
                  Viewing as student — back to admin
                </button>
              </form>
            )
          ) : null}
          <form action="/logout" method="post">
            <button type="submit" className="underline-offset-4 hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
