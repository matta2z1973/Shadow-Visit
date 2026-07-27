import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getMatchDetail } from "@/lib/matching/match-detail";
import { buildIcs, type IcsEvent } from "@/lib/ics";

function dtstampNow(): string {
  // UTC stamp: YYYYMMDDTHHMMSSZ
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  await requireAdmin();
  const { matchId } = await params;
  const detail = await getMatchDetail(matchId);
  if (!detail) return new NextResponse("Not found", { status: 404 });

  const { prospective, host, timeline, match } = detail;
  const events: IcsEvent[] = [];

  // Whole shadow-day event (span of the host's day).
  if (timeline.length) {
    const start = timeline[0].startTime;
    const end = timeline[timeline.length - 1].endTime;
    const desc = timeline
      .map((r) => `${r.startTime.slice(0, 5)}-${r.endTime.slice(0, 5)} ${r.title}`)
      .join("\n");
    events.push({
      uid: `shadow-${match.id}@greenhill`,
      title: `Shadow Visit — ${prospective.fullName}${host ? ` with ${host.fullName}` : ""}`,
      description: desc,
      location: "Greenhill School",
      date: match.shadowDate,
      startTime: start,
      endTime: end,
      attendeeEmails: prospective.familyEmail ? [prospective.familyEmail] : [],
    });
  }

  // Interview (may be on a different date than the shadow day).
  if (prospective.interviewDate && prospective.interviewStart && prospective.interviewEnd) {
    events.push({
      uid: `interview-${match.id}@greenhill`,
      title: `Admissions Interview — ${prospective.fullName}`,
      location: "Greenhill School Admissions",
      date: prospective.interviewDate,
      startTime: prospective.interviewStart,
      endTime: prospective.interviewEnd,
      attendeeEmails: prospective.familyEmail ? [prospective.familyEmail] : [],
    });
  }

  if (!events.length) {
    return new NextResponse("Nothing to export for this match yet.", { status: 400 });
  }

  const ics = buildIcs(events, dtstampNow());
  const safeName = prospective.fullName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="shadow-visit-${safeName}.ics"`,
    },
  });
}
