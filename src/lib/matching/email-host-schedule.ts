// Emails one confirmed match's host their day's schedule — the attached
// .ics is identical to the one from the "Download .ics" button, plus an
// HTML summary in the email body itself (a host without a calendar app
// handy should still be able to read their day straight from the email).
import { getMatchDetail, type MatchDetail } from "./match-detail";
import { buildMatchIcs } from "./build-match-ics";
import { fmtTime } from "@/lib/schedule/day-timeline";
import { sendEmail } from "@/lib/email";

export type EmailHostScheduleResult = { ok: boolean; message: string };

function buildEmailHtml(detail: MatchDetail): string {
  const { prospective, timeline } = detail;
  const rows = timeline
    .map(
      (r) =>
        `<tr><td style="padding:4px 12px 4px 0;white-space:nowrap;color:#555;">${fmtTime(r.startTime)}–${fmtTime(r.endTime)}</td><td style="padding:4px 0;">${r.title}${r.detail ? ` <span style="color:#888;">(${r.detail})</span>` : ""}</td></tr>`,
    )
    .join("");

  return `
    <div style="font-family:system-ui,sans-serif;max-width:520px;">
      <h2 style="margin:0 0 4px;">Your shadow visit day</h2>
      <p style="color:#555;margin:0 0 16px;">
        You're hosting <strong>${prospective.fullName}</strong> (grade ${prospective.grade ?? "?"}) on ${detail.match.shadowDate}.
      </p>
      <table style="border-collapse:collapse;font-size:14px;">${rows}</table>
      <p style="color:#888;font-size:13px;margin-top:20px;">
        A calendar file is attached — open it to add this to your calendar.
      </p>
    </div>
  `;
}

export async function emailHostSchedule(matchId: string): Promise<EmailHostScheduleResult> {
  const detail = await getMatchDetail(matchId);
  if (!detail) return { ok: false, message: "Match not found." };
  if (!detail.host) return { ok: false, message: "No host assigned to this match." };
  if (!detail.hostEmail) {
    return {
      ok: false,
      message: `${detail.host.fullName} has no email on file — they need to log in at /me at least once.`,
    };
  }

  const built = buildMatchIcs(detail);
  const attachments = built
    ? [{ filename: built.filename, content: built.ics, contentType: "text/calendar; charset=utf-8" }]
    : undefined;

  const result = await sendEmail({
    to: detail.hostEmail,
    subject: `Your shadow visit on ${detail.match.shadowDate} — hosting ${detail.prospective.fullName}`,
    html: buildEmailHtml(detail),
    attachments,
  });

  if (!result.ok) return { ok: false, message: `${detail.host.fullName}: ${result.error}` };
  return { ok: true, message: `Sent to ${detail.host.fullName} (${detail.hostEmail}).` };
}
