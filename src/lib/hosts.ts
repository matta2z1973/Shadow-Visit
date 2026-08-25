import { db } from "@/lib/db";
import { hostStudents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// A host student's row is keyed to their auth profile once they log in —
// created on first visit to /me.
export async function getOrCreateHost(user: {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
}) {
  const [existing] = await db
    .select()
    .from(hostStudents)
    .where(eq(hostStudents.profileId, user.id))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(hostStudents)
    .values({
      profileId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName ?? "Unknown",
    })
    .returning();
  return created;
}
