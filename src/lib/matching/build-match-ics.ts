// Builds the .ics file for one match — shared by the download route
// (admin/schedule/[matchId]/ics) and the "email schedule to host" action, so
// both produce identical calendar content.
import { buildIcs, type IcsEvent } from "@/lib/ics";
import type { MatchDetail } from "./match-detail";

function dtstampNow(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildMatchIcs(
  detail: MatchDetail,
): { ics: string; filename: string } | null {
  const { prospective, host, timeline, match } = detail;
  const events: IcsEvent[] = [];

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

  if (!events.length) return null;

  const ics = buildIcs(events, dtstampNow());
  const safeName = prospective.fullName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return { ics, filename: `shadow-visit-${safeName}.ics` };
}
