import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  matches,
  prospectiveStudents,
  hostStudents,
  staff,
} from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// FinalSite re-import CSV: confirmed prospective↔host↔date for a shadow date.
export async function GET(req: Request) {
  await requireAdmin();
  const date = new URL(req.url).searchParams.get("date");
  if (!date) return new NextResponse("Missing ?date", { status: 400 });

  const rows = await db
    .select()
    .from(matches)
    .where(and(eq(matches.shadowDate, date), inArray(matches.status, ["confirmed", "sent"])));

  const pIds = [...new Set(rows.map((r) => r.prospectiveId))];
  const hIds = [...new Set(rows.map((r) => r.hostStudentId).filter((x): x is string => !!x))];
  const [pRows, hRows, staffRows] = await Promise.all([
    pIds.length ? db.select().from(prospectiveStudents).where(inArray(prospectiveStudents.id, pIds)) : Promise.resolve([]),
    hIds.length ? db.select().from(hostStudents).where(inArray(hostStudents.id, hIds)) : Promise.resolve([]),
    db.select().from(staff),
  ]);
  const pMap = new Map(pRows.map((p) => [p.id, p]));
  const hMap = new Map(hRows.map((h) => [h.id, h]));
  const sMap = new Map(staffRows.map((s) => [s.id, s.fullName]));

  const header = [
    "Prospective Student",
    "Grade",
    "Gender",
    "Shadow Date",
    "Day Type",
    "Host Student",
    "Admissions Counselor",
    "Interview Date",
    "Interview Time",
    "Free Periods",
  ];
  const lines = [header.map(csvCell).join(",")];

  for (const m of rows) {
    const p = pMap.get(m.prospectiveId);
    const h = m.hostStudentId ? hMap.get(m.hostStudentId) : null;
    const counselor = p?.counselorStaffId ? sMap.get(p.counselorStaffId) : "";
    const interviewTime =
      p?.interviewStart && p?.interviewEnd
        ? `${p.interviewStart.slice(0, 5)}-${p.interviewEnd.slice(0, 5)}`
        : "";
    lines.push(
      [
        p?.fullName ?? "",
        p?.grade ?? "",
        p?.gender ?? "",
        m.shadowDate,
        m.dayType ?? "",
        h?.fullName ?? "",
        counselor ?? "",
        p?.interviewDate ?? "",
        interviewTime,
        m.freePeriodCount ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="shadow-visits-${date}.csv"`,
    },
  });
}
