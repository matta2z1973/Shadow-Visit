import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  hostStudents,
  hostStudentInterests,
  interests,
} from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { INTEREST_CATEGORIES } from "@/lib/interest-categories";
import InterestsForm from "./interests-form";

export const dynamic = "force-dynamic";

async function getOrCreateHost(user: {
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

export default async function MePage() {
  const user = await requireUser();
  const host = await getOrCreateHost(user);

  const allInterests = await db
    .select()
    .from(interests)
    .where(eq(interests.active, true))
    .orderBy(asc(interests.category), asc(interests.sortOrder), asc(interests.name));

  const selected = await db
    .select({ interestId: hostStudentInterests.interestId })
    .from(hostStudentInterests)
    .where(eq(hostStudentInterests.hostStudentId, host.id));
  const selectedIds = selected.map((s) => s.interestId);

  const groups = INTEREST_CATEGORIES.map((c) => ({
    label: c.label,
    items: allInterests
      .filter((i) => i.category === c.slug)
      .map((i) => ({ id: i.id, name: i.name })),
  })).filter((g) => g.items.length > 0);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">My interests</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Tell us a bit about yourself so we can match you with the right shadow
        visitors.
      </p>
      <InterestsForm
        host={{ grade: host.grade, gender: host.gender }}
        groups={groups}
        selectedIds={selectedIds}
      />
    </main>
  );
}
