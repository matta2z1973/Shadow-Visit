import Link from "next/link";

export default function HostsTabs({
  active,
}: {
  active: "roster" | "schedules";
}) {
  const cls = (t: string) =>
    t === active
      ? "rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      : "rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700";
  return (
    <div className="mt-4 flex gap-2">
      <Link href="/admin/hosts" className={cls("roster")}>
        Roster
      </Link>
      <Link href="/admin/hosts/schedules" className={cls("schedules")}>
        Schedules
      </Link>
    </div>
  );
}
