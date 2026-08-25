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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
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
