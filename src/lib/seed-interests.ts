// Seed list for the admin-managed `interests` table, grouped into the four
// categories (Academics / Fine Arts / Athletics / Innovation). Admin can
// add/edit/remove and recategorize after seeding. Categories are best-guess
// placements — several clubs and publications are judgment calls the admin may
// want to adjust.
import type { CategorySlug } from "@/lib/interest-categories";

export type SeedInterest = { name: string; category: CategorySlug };

export const BY_CATEGORY: Record<CategorySlug, string[]> = {
  academics: [
    "Chinese",
    "English",
    "History",
    "Latin",
    "Math",
    "Science",
    "Spanish",
    "Affinity Groups",
    "Chess Club",
    "Community Service",
    "Debate/Speech",
    "Math Club",
    "Model UN Club",
    "Quiz Bowl",
  ],
  fine_arts: [
    "2D/Studio Art",
    "3D Art",
    "Band",
    "Chamber Orchestra",
    "Choir",
    "Dance",
    "Drama/Theater",
    "Filmmaking",
    "Improv",
    "Literary Magazine",
    "Newspaper",
    "Photography",
    "Technical Theatre",
    "Yearbook",
  ],
  athletics: [
    "Baseball (boys)",
    "Basketball (boys/girls)",
    "Cheerleading (boys/girls)",
    "Cross Country (boys/girls)",
    "Field Hockey (girls)",
    "Football (boys/girls)",
    "Golf (boys/girls)",
    "Lacrosse (boys/girls)",
    "Soccer (boys/girls)",
    "Softball (girls)",
    "Swimming (boys/girls)",
    "Tennis (boys/girls)",
    "Track (boys/girls)",
    "Volleyball (boys/girls)",
  ],
  innovation: [
    "Technology/Innovation",
    "Automation/Robotics",
    "Computer Science",
    "Engineering",
    "Entrepreneurship",
    "Human Centered Design",
  ],
};

export const SEED_INTERESTS: SeedInterest[] = (
  Object.entries(BY_CATEGORY) as [CategorySlug, string[]][]
).flatMap(([category, names]) => names.map((name) => ({ name, category })));
