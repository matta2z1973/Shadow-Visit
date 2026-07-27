"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { interests } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

const CATEGORY = z.enum(["academics", "fine_arts", "athletics", "innovation"]);

const addSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: CATEGORY,
});

export async function setCategory(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().safeParse(formData.get("id"));
  const category = CATEGORY.safeParse(formData.get("category"));
  if (!id.success || !category.success) return;
  await db
    .update(interests)
    .set({ category: category.data })
    .where(eq(interests.id, id.data));
  revalidatePath("/admin/interests");
}

export async function addInterest(formData: FormData) {
  await requireAdmin();
  const parsed = addSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category"),
  });
  if (!parsed.success) return;

  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${interests.sortOrder}), 0)::int` })
    .from(interests);

  await db
    .insert(interests)
    .values({ ...parsed.data, sortOrder: (max ?? 0) + 1 })
    .onConflictDoNothing();
  revalidatePath("/admin/interests");
}

export async function renameInterest(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().safeParse(formData.get("id"));
  const name = z.string().trim().min(1).max(120).safeParse(formData.get("name"));
  if (!id.success || !name.success) return;
  await db
    .update(interests)
    .set({ name: name.data })
    .where(eq(interests.id, id.data));
  revalidatePath("/admin/interests");
}

export async function toggleInterest(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  await db
    .update(interests)
    .set({ active: sql`not ${interests.active}` })
    .where(eq(interests.id, id.data));
  revalidatePath("/admin/interests");
}

export async function deleteInterest(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  await db.delete(interests).where(eq(interests.id, id.data));
  revalidatePath("/admin/interests");
}
