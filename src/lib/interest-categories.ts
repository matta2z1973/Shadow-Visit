// The four interest categories. Stored as a slug on interests.category (text),
// validated in the app rather than a DB enum so admins can recategorize freely.

export const INTEREST_CATEGORIES = [
  { slug: "academics", label: "Academics" },
  { slug: "fine_arts", label: "Fine Arts" },
  { slug: "athletics", label: "Athletics" },
  { slug: "innovation", label: "Innovation" },
] as const;

export type CategorySlug = (typeof INTEREST_CATEGORIES)[number]["slug"];

export const CATEGORY_SLUGS: CategorySlug[] = INTEREST_CATEGORIES.map(
  (c) => c.slug,
);

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  INTEREST_CATEGORIES.map((c) => [c.slug, c.label]),
);

export function categoryLabel(slug: string): string {
  return CATEGORY_LABEL[slug] ?? slug;
}
