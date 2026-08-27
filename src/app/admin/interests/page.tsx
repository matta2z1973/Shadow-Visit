import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { interests } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { INTEREST_CATEGORIES } from "@/lib/interest-categories";
import SettingsTabs from "@/components/settings-tabs";
import {
  addInterest,
  renameInterest,
  toggleInterest,
  deleteInterest,
  setCategory,
} from "./actions";

export const dynamic = "force-dynamic";

type Row = { id: string; name: string; active: boolean; category: string };

function CategorySelect({ id, value }: { id: string; value: string }) {
  return (
    <form action={setCategory}>
      <input type="hidden" name="id" value={id} />
      <select
        name="category"
        defaultValue={value}
        className="rounded border border-zinc-300 bg-transparent px-1.5 py-1 text-xs dark:border-zinc-700"
        // Auto-submit on change via the form's requestSubmit.
        // (Progressive enhancement: a Save button also works if JS is off.)
      >
        {INTEREST_CATEGORIES.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.label}
          </option>
        ))}
      </select>
      <button type="submit" className="ml-1 text-xs text-zinc-500 hover:underline">
        move
      </button>
    </form>
  );
}

function Section({ slug, label, items }: { slug: string; label: string; items: Row[] }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{label}</h2>

      <ul className="mt-3 divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <form action={renameInterest} className="flex flex-1 items-center gap-2">
              <input type="hidden" name="id" value={i.id} />
              <input
                name="name"
                defaultValue={i.name}
                className={`flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-sm hover:border-zinc-300 focus:border-zinc-400 focus:outline-none dark:hover:border-zinc-700 ${i.active ? "" : "text-zinc-400 line-through"}`}
              />
              <button type="submit" className="text-xs text-zinc-500 underline-offset-2 hover:underline">
                rename
              </button>
            </form>
            <CategorySelect id={i.id} value={i.category} />
            <form action={toggleInterest}>
              <input type="hidden" name="id" value={i.id} />
              <button type="submit" className="text-xs text-zinc-500 underline-offset-2 hover:underline">
                {i.active ? "disable" : "enable"}
              </button>
            </form>
            <form action={deleteInterest}>
              <input type="hidden" name="id" value={i.id} />
              <button type="submit" className="text-xs text-red-600 underline-offset-2 hover:underline">
                delete
              </button>
            </form>
          </li>
        ))}
        {items.length === 0 ? (
          <li className="px-4 py-3 text-sm text-zinc-500">None yet.</li>
        ) : null}
      </ul>

      <form action={addInterest} className="mt-3 flex items-center gap-2">
        <input type="hidden" name="category" value={slug} />
        <input
          name="name"
          placeholder={`Add ${label} interest…`}
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button type="submit" className="rounded-md bg-forest px-3 py-2 text-sm font-medium text-white dark:bg-forest dark:text-white">
          Add
        </button>
      </form>
    </section>
  );
}

export default async function InterestsAdmin() {
  await requireAdmin();
  const all = await db
    .select()
    .from(interests)
    .orderBy(asc(interests.sortOrder), asc(interests.name));

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Interests</h1>

      <SettingsTabs active="interests" />

      <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        Organized into four categories. Use &ldquo;move&rdquo; to recategorize an
        interest. Disabled interests stay on past records but can&rsquo;t be newly
        selected.
      </p>
      {INTEREST_CATEGORIES.map((c) => (
        <Section
          key={c.slug}
          slug={c.slug}
          label={c.label}
          items={all.filter((i) => i.category === c.slug)}
        />
      ))}
    </main>
  );
}
