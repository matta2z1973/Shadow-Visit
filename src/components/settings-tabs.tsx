import Link from "next/link";

export default function SettingsTabs({
  active,
}: {
  active: "interests" | "staff" | "ai" | "season" | "test-hosts";
}) {
  const cls = (t: string) =>
    t === active
      ? "rounded-md bg-forest px-3 py-1.5 text-sm font-medium text-white dark:bg-forest dark:text-white"
      : "rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700";
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Link href="/admin/interests" prefetch={false} className={cls("interests")}>
        Interests
      </Link>
      <Link href="/admin/staff" prefetch={false} className={cls("staff")}>
        Staff
      </Link>
      <Link href="/admin/settings" prefetch={false} className={cls("ai")}>
        AI Settings
      </Link>
      <Link href="/admin/settings/season" prefetch={false} className={cls("season")}>
        Season
      </Link>
      <Link href="/admin/settings/test-hosts" prefetch={false} className={cls("test-hosts")}>
        Test Hosts
      </Link>
    </div>
  );
}
