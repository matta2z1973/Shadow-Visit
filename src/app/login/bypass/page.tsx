import BypassForm from "./bypass-form";

export const dynamic = "force-dynamic";

// Deliberately not linked from /login or anywhere in the nav — reachable
// only by URL. See src/lib/auth.ts (ADMIN_BYPASS_COOKIE) for how this is
// wired in, and delete ADMIN_BYPASS_TOKEN from the environment to disable
// this route's effect entirely once magic-link email is working.
export default function BypassPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-4 px-6 py-16">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Admin bypass</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Temporary — for use while magic-link email isn&rsquo;t reliable yet.
        </p>
      </div>
      <BypassForm />
    </main>
  );
}
