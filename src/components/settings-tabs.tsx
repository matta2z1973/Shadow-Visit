import Link from "next/link";

export default function SettingsTabs({
  active,
}: {
  active: "interests" | "staff" | "ai";
}) {
  const cls = (t: string) =>
    t === active
      ? "rounded-md bg-forest px-3 py-1.5 text-sm font-medium text-white dark:bg-forest dark:text-white"
      : "rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700";
  return (
    <div className="mt-4 flex gap-2">
      <Link href="/admin/interests" className={cls("interests")}>
        Interests
      </Link>
      <Link href="/admin/staff" className={cls("staff")}>
        Staff
      </Link>
      <Link href="/admin/settings" className={cls("ai")}>
        AI Settings
      </Link>
    </div>
  );
}
