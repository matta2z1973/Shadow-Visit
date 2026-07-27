import { addDays, parseISO, format } from "date-fns";

export type DivisionCode = "US" | "MS";
export type DayType = "green" | "gold" | "a_day" | "b_day" | "c_day" | "no_school";

const MS_WEEKDAY_TO_DAY_TYPE: Record<number, DayType> = {
  // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  1: "c_day",
  2: "a_day",
  3: "b_day",
  4: "a_day",
  5: "b_day",
};

export function dayTypeFromUsDayNumber(
  n: number,
): "green" | "gold" {
  return n % 2 === 1 ? "green" : "gold";
}

export function nextUsDayNumber(n: number): number {
  return n >= 8 ? 1 : n + 1;
}

export function msDayTypeForWeekday(date: Date): DayType | null {
  return MS_WEEKDAY_TO_DAY_TYPE[date.getUTCDay()] ?? null;
}

export type DateRow = {
  date: string; // YYYY-MM-DD
  isSchoolDay: boolean;
  dayType: DayType;
  dayNumber: number | null; // 1-8 for US, null otherwise
};

/**
 * Generate one row per calendar date from `start` to `end` inclusive.
 *
 * For US: needs `firstUsDayNumber` (1-8) for the first scheduled school day.
 *   Each subsequent school day advances by one in the 1→8 cycle.
 * For MS: day-type is derived from the weekday (Mon=C, Tue/Thu=A, Wed/Fri=B).
 *
 * Weekends (Sat/Sun) default to non-school. Caller can flip any row's
 * isSchoolDay later for one-off adjustments (holidays, weather days).
 */
export function generateDateRows(args: {
  start: string;
  end: string;
  division: DivisionCode;
  firstUsDayNumber?: number;
}): DateRow[] {
  const { start, end, division } = args;
  const startDate = parseISO(start);
  const endDate = parseISO(end);
  if (startDate > endDate) return [];

  const rows: DateRow[] = [];
  let usCounter = args.firstUsDayNumber ?? 1;
  let firstUsAssigned = false;

  for (
    let d = startDate;
    d <= endDate;
    d = addDays(d, 1)
  ) {
    const dateStr = format(d, "yyyy-MM-dd");
    const weekday = d.getUTCDay();
    const isWeekend = weekday === 0 || weekday === 6;
    if (isWeekend) continue; // weekends never appear in coverage requests

    if (division === "US") {
      if (firstUsAssigned) {
        usCounter = nextUsDayNumber(usCounter);
      } else {
        firstUsAssigned = true;
      }
      rows.push({
        date: dateStr,
        isSchoolDay: true,
        dayType: dayTypeFromUsDayNumber(usCounter),
        dayNumber: usCounter,
      });
    } else {
      const msType = msDayTypeForWeekday(d);
      if (!msType) continue;
      rows.push({
        date: dateStr,
        isSchoolDay: true,
        dayType: msType,
        dayNumber: null,
      });
    }
  }

  return rows;
}
