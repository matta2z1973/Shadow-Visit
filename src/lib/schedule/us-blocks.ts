// Canonical Upper School block grid (from the 2025-2026 US Daily Schedule).
// Green days run A-D; Gold days run E-H, at these fixed times. Used to compute
// free periods (academic slots a host has no class in) and to lay out the day.

export type UsBlockSlot = {
  label: string;
  startTime: string; // HH:MM:SS
  endTime: string;
  isAcademic: boolean;
};

export const US_GREEN_BLOCKS: UsBlockSlot[] = [
  { label: "A", startTime: "08:30:00", endTime: "09:50:00", isAcademic: true },
  { label: "B", startTime: "09:55:00", endTime: "11:15:00", isAcademic: true },
  { label: "Advisory", startTime: "11:20:00", endTime: "11:45:00", isAcademic: false },
  { label: "C", startTime: "11:50:00", endTime: "13:10:00", isAcademic: true },
  { label: "Lunch", startTime: "13:10:00", endTime: "13:50:00", isAcademic: false },
  { label: "D", startTime: "14:35:00", endTime: "15:55:00", isAcademic: true },
];

export const US_GOLD_BLOCKS: UsBlockSlot[] = [
  { label: "E", startTime: "08:30:00", endTime: "09:50:00", isAcademic: true },
  { label: "F", startTime: "09:55:00", endTime: "11:15:00", isAcademic: true },
  { label: "G", startTime: "11:50:00", endTime: "13:10:00", isAcademic: true },
  { label: "Lunch", startTime: "13:10:00", endTime: "13:50:00", isAcademic: false },
  { label: "H", startTime: "14:35:00", endTime: "15:55:00", isAcademic: true },
];

// The 4 academic block letters per day-type.
export const GREEN_ACADEMIC = ["A", "B", "C", "D"];
export const GOLD_ACADEMIC = ["E", "F", "G", "H"];

export function academicLettersFor(dayType: "green" | "gold"): string[] {
  return dayType === "green" ? GREEN_ACADEMIC : GOLD_ACADEMIC;
}

export function blockGridFor(dayType: "green" | "gold"): UsBlockSlot[] {
  return dayType === "green" ? US_GREEN_BLOCKS : US_GOLD_BLOCKS;
}

// Generic day windows (green & gold share the same times) — used for staff
// free/busy display and meeting slotting, independent of rotation.
export const US_PERIOD_WINDOWS: { label: string; startTime: string; endTime: string }[] = [
  { label: "P1", startTime: "08:30:00", endTime: "09:50:00" },
  { label: "P2", startTime: "09:55:00", endTime: "11:15:00" },
  { label: "Advisory", startTime: "11:20:00", endTime: "11:45:00" },
  { label: "P3", startTime: "11:50:00", endTime: "13:10:00" },
  { label: "Lunch", startTime: "13:10:00", endTime: "13:50:00" },
  { label: "P4", startTime: "14:35:00", endTime: "15:55:00" },
];
