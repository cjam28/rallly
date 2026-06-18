import { dayjs } from "@/lib/dayjs";
import type { BusyMinutes } from "./busy";

/**
 * Reproject busy windows keyed by UTC calendar dates into poll-local date keys.
 * Each output window uses minutes-since-midnight in the target timezone.
 */
export function normalizeBusyToTimezone(
  busy: BusyMinutes,
  timeZone: string,
  options: { assumeUtcDateKeys?: boolean } = {},
): BusyMinutes {
  const { assumeUtcDateKeys = true } = options;
  const result: BusyMinutes = {};

  const addSlice = (dateKey: string, start: number, end: number) => {
    if (end <= start) return;
    if (!result[dateKey]) result[dateKey] = [];
    result[dateKey].push({ start, end });
  };

  for (const [dateKey, windows] of Object.entries(busy)) {
    if (!Array.isArray(windows)) continue;

    const year = Number.parseInt(dateKey.slice(0, 4), 10);
    const month = Number.parseInt(dateKey.slice(4, 6), 10) - 1;
    const day = Number.parseInt(dateKey.slice(6, 8), 10);

    for (const window of windows) {
      const base = assumeUtcDateKeys
        ? dayjs.utc().year(year).month(month).date(day).startOf("day")
        : dayjs.tz(
            `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00`,
            timeZone,
          );

      let cursor = base.add(window.start, "minute");
      const end = base.add(window.end, "minute");

      while (cursor.isBefore(end)) {
        const dayEnd = cursor.endOf("day");
        const sliceEnd = end.isBefore(dayEnd) ? end : dayEnd;
        const localDateKey = cursor.tz(timeZone).format("YYYYMMDD");
        const startMin = cursor
          .tz(timeZone)
          .diff(cursor.tz(timeZone).startOf("day"), "minute");
        const endMin = sliceEnd
          .tz(timeZone)
          .diff(sliceEnd.tz(timeZone).startOf("day"), "minute");
        addSlice(localDateKey, startMin, endMin);
        cursor = sliceEnd.add(1, "minute").startOf("minute");
      }
    }
  }

  return result;
}
