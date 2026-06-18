const pad2 = (n: number) => String(n).padStart(2, "0");

function getPartsInTimeZone(
  date: Date,
  timeZone: string,
): Record<"year" | "month" | "day" | "hour" | "minute" | "second", number> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour") % 24,
    minute: read("minute"),
    second: read("second"),
  };
}

/** Calendar date in a timezone as YYYYMMDD */
export function dateKeyInTimeZone(d: Date, timeZone: string): string {
  const { year, month, day } = getPartsInTimeZone(d, timeZone);
  return `${year}${pad2(month)}${pad2(day)}`;
}

/** Convert wall-clock minutes on a calendar date in `timeZone` to a UTC instant */
export function wallTimeToUtc(
  dateKey: string,
  minutes: number,
  timeZone: string,
): Date {
  const year = Number.parseInt(dateKey.slice(0, 4), 10);
  const month = Number.parseInt(dateKey.slice(4, 6), 10);
  const day = Number.parseInt(dateKey.slice(6, 8), 10);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;

  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0);

  for (let i = 0; i < 4; i++) {
    const parts = getPartsInTimeZone(new Date(utcMs), timeZone);
    const targetDayMs = Date.UTC(year, month - 1, day);
    const actualDayMs = Date.UTC(parts.year, parts.month - 1, parts.day);
    const dayDiffMs = targetDayMs - actualDayMs;
    const targetMin = hour * 60 + minute;
    const actualMin = parts.hour * 60 + parts.minute;
    const adjustMs = dayDiffMs + (targetMin - actualMin) * 60_000;
    if (adjustMs === 0) break;
    utcMs += adjustMs;
  }

  return new Date(utcMs);
}

/** Format a UTC ISO string as naive local wall time in `timeZone` (for poll options) */
export function formatNaiveInTimeZone(iso: string, timeZone: string): string {
  const d = new Date(iso);
  const { year, month, day, hour, minute, second } = getPartsInTimeZone(
    d,
    timeZone,
  );
  return `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
}

export function incrementDateKey(dateKey: string): string {
  const y = Number.parseInt(dateKey.slice(0, 4), 10);
  const m = Number.parseInt(dateKey.slice(4, 6), 10);
  const d = Number.parseInt(dateKey.slice(6, 8), 10);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.getUTCFullYear()}${pad2(next.getUTCMonth() + 1)}${pad2(next.getUTCDate())}`;
}

export function dayOfWeekInTimeZone(date: Date, timeZone: string): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(date);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}
