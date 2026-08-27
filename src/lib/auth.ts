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

// TEMPORARY — magic-link email isn't reliably delivering yet (Resend domain
// not verified). Lets in as the existing admin profile without going through
// Supabase auth at all, gated behind a random secret in ADMIN_BYPASS_TOKEN.
// Entirely inert unless that env var is set — delete it (no code changes
// needed) to fully disable this the moment real email sign-in works.
// See src/app/login/bypass/ for where the cookie gets set.
export const ADMIN_BYPASS_COOKIE = "sv_admin_bypass";

type Profile = typeof profiles.$inferSelect;

// Resolves only the underlying admin profile row — the VIEW_AS_COOKIE
// downgrade in getCurrentUser() applies uniformly afterward regardless of
// whether the profile came from here or a real Supabase session, so "View
// as student" still works while signed in via the bypass.
async function getBypassProfile(): Promise<Profile | null> {
  const token = process.env.ADMIN_BYPASS_TOKEN;
  if (!token) return null;
  const store = await cookies();
  if (store.get(ADMIN_BYPASS_COOKIE)?.value !== token) return null;

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.role, "admin"))
    .limit(1);
  return profile ?? null;
}

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
  let profile: Profile | null = await getBypassProfile();

  if (!profile) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const [row] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);
    profile = row ?? null;
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
