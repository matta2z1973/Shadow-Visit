import Link from "next/link";
import { requireUser } from "@/lib/auth";

export default async function MeConfirmationPage() {
  await requireUser();

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col items-center px-6 py-16 text-center">
      <div className="text-4xl" aria-hidden>
        ✅
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">You&rsquo;re all set!</h1>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        Thanks for sharing your interests. Admissions will be in touch if a prospective student is
        matched with you for a shadow visit.
      </p>
      <div className="mt-8 flex items-center gap-3">
        <Link
          href="/me"
          prefetch={false}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
        >
          Back to my interests
        </Link>
        <form action="/logout" method="post">
          <button
            type="submit"
            className="rounded-md bg-forest px-4 py-2 text-sm font-medium text-white dark:bg-forest dark:text-white"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
