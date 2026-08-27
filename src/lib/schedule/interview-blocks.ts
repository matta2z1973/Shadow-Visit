// 30-minute interview slot options offered on the admissions staff
// availability form, 8:00am through the 2:30-3:00pm block.
export const INTERVIEW_WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
] as const;

function formatLabel(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? "AM" : "PM";
  return `${h12}:${minute.toString().padStart(2, "0")} ${suffix}`;
}

export const INTERVIEW_TIME_BLOCKS: { start: string; label: string }[] = (() => {
  const blocks: { start: string; label: string }[] = [];
  for (let mins = 8 * 60; mins < 15 * 60; mins += 30) {
    const hour = Math.floor(mins / 60);
    const minute = mins % 60;
    const start = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
    const endMins = mins + 30;
    const endHour = Math.floor(endMins / 60);
    const endMinute = endMins % 60;
    blocks.push({
      start,
      label: `${formatLabel(hour, minute)}–${formatLabel(endHour, endMinute)}`,
    });
  }
  return blocks;
})();
