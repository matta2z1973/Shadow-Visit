import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Lets an admin preview the student portal without changing their real
// permissions. Only ever downgrades the *displayed* role for admins — a
// student forging this cookie gains nothing, since their real role still
// gates every admin-only check.
export const VIEW_AS_COOKIE = "svp_view_as";

type Profile = typeof profiles.$inferSelect;

export type AppUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  role: "student" | "admin";
  actualRole: "student" | "admin";
};

// Every page calls this at least twice per request — once via the shared
// nav layout (to render the header) and again via its own requireUser()/
// requireAdmin() call — each a fully independent round trip to Supabase's
// Auth API plus a DB lookup. On a database connection that's only
// intermittently reliable, two chances to hit that flakiness on every
// single page load meaningfully compounds the failure rate. React's
// cache() memoizes this per-request (all calls with these — zero —
// arguments within the same render return the same promise), so it only
// actually runs once no matter how many places in the tree call it.
export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const supabase = await createSupabaseServerClient();

  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"];
  try {
    // supabase.auth.getUser() calls out to Supabase's Auth API — a
    // separate service from our own Postgres pool, with no timeout of its
    // own. Every DB call in this app is now bounded (statement_timeout,
    // connect_timeout), but this one wasn't, so it could still hang the
    // whole request indefinitely before any page-specific code even runs —
    // which would look like a page-specific bug when it's really this
    // shared, universal call stalling on an unrelated timing coincidence.
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("auth.getUser() timed out")), 10_000),
    );
    const result = await Promise.race([supabase.auth.getUser(), timeout]);
    user = result.data.user;
  } catch (err) {
    console.error("getCurrentUser: auth.getUser() failed", err);
    return null;
  }
  if (!user) return null;

  let profile: Profile | null;
  try {
    const [row] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);
    profile = row ?? null;
  } catch (err) {
    // A transient DB failure here (e.g. a stalled connection getting
    // force-cancelled by statement_timeout) must not become an unhandled
    // rejection — that crashes the whole serverless process for every
    // concurrent request it's handling, not just this one. Degrade to
    // "not signed in" so the caller redirects to /login instead of the
    // process dying outright; the user can just retry.
    console.error("getCurrentUser: profile lookup failed", err);
    return null;
  }
  if (!profile) return null;

  let role: AppUser["role"] = profile.role;
  if (profile.role === "admin") {
    const store = await cookies();
    if (store.get(VIEW_AS_COOKIE)?.value === "student") role = "student";
  }

  return {
    id: profile.id,
    email: profile.email,
    firstName: profile.firstName,
    lastName: profile.lastName,
    fullName: profile.fullName,
    role,
    actualRole: profile.role,
  };
});

export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<AppUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/?error=admin_required");
  return user;
}
