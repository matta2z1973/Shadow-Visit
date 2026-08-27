import Link from "next/link";

export default function ProspectivesTabs({
  active,
}: {
  active: "students" | "upload";
}) {
  const cls = (t: string) =>
    t === active
      ? "rounded-md bg-forest px-3 py-1.5 text-sm font-medium text-white dark:bg-forest dark:text-white"
      : "rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700";
  return (
    <div className="mt-4 flex gap-2">
      <Link href="/admin/prospectives" className={cls("students")}>
        Students
      </Link>
      <Link href="/admin/prospectives/upload" className={cls("upload")}>
        Upload
      </Link>
    </div>
  );
}
