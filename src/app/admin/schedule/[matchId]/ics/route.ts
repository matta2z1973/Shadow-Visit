import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getMatchDetail } from "@/lib/matching/match-detail";
import { buildMatchIcs } from "@/lib/matching/build-match-ics";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  await requireAdmin();
  const { matchId } = await params;
  const detail = await getMatchDetail(matchId);
  if (!detail) return new NextResponse("Not found", { status: 404 });

  const built = buildMatchIcs(detail);
  if (!built) {
    return new NextResponse("Nothing to export for this match yet.", { status: 400 });
  }

  return new NextResponse(built.ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${built.filename}"`,
    },
  });
}
