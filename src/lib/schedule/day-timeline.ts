// Builds the prospective's shadow-day timeline: the host's blocks for that date
// (they shadow the host) merged with any scheduled meetings (admissions
// interview, faculty subject meetings), ordered by start time.

export type TimelineRow = {
  startTime: string; // HH:MM:SS
  endTime: string;
  title: string;
  detail: string | null;
  kind: "class" | "interview" | "faculty" | "other";
};

export type HostBlockInput = {
  blockLabel: string;
  courseTitle: string | null;
  room: string | null;
  teacher: string | null;
  isAcademic: boolean;
  startTime: string;
  endTime: string;
};

export type MeetingInput = {
  kind: "admissions_interview" | "faculty_meeting";
  title: string;
  detail: string | null;
  startTime: string | null;
  endTime: string | null;
};

export function fmtTime(hms: string): string {
  const [h, m] = hms.split(":").map((n) => parseInt(n, 10));
  const mer = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${mer}`;
}

export function buildTimeline(
  hostBlocks: HostBlockInput[],
  meetings: MeetingInput[],
): TimelineRow[] {
  const rows: TimelineRow[] = [];

  for (const b of hostBlocks) {
    rows.push({
      startTime: b.startTime,
      endTime: b.endTime,
      title: b.courseTitle
        ? `${b.blockLabel} — ${b.courseTitle}`
        : b.blockLabel,
      detail: [b.room, b.teacher].filter(Boolean).join(" · ") || null,
      kind: b.isAcademic ? "class" : "other",
    });
  }

  for (const m of meetings) {
    if (!m.startTime || !m.endTime) continue;
    rows.push({
      startTime: m.startTime,
      endTime: m.endTime,
      title: m.title,
      detail: m.detail,
      kind: m.kind === "admissions_interview" ? "interview" : "faculty",
    });
  }

  return rows.sort((a, b) => a.startTime.localeCompare(b.startTime));
}
