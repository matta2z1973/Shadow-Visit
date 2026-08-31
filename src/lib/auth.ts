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

export async function getCurrentUser(): Promise<AppUser | null> {
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
}

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
