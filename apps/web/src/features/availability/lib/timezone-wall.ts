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
  const targetMin = hour * 60 + minute;
  const targetDayMs = Date.UTC(year, month - 1, day);

  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0);

  for (let i = 0; i < 4; i++) {
    const parts = getPartsInTimeZone(new Date(utcMs), timeZone);
    const actualDayMs = Date.UTC(parts.year, parts.month - 1, parts.day);
    const actualMin = parts.hour * 60 + parts.minute;
    const adjustMs =
      targetDayMs - actualDayMs + (targetMin - actualMin) * 60_000;
    if (adjustMs === 0) break;
    utcMs += adjustMs;
  }

  // DST spring-forward gap check: if the converged UTC doesn't round-trip back
  // to the requested wall time, the requested time falls in a non-existent gap
  // hour (e.g. 2:00–3:00 AM on spring-forward night in America/New_York).
  // The correction loop oscillates rather than converging in that case. Clamp
  // forward to the first valid wall minute >= the requested time (the post-gap
  // transition instant, i.e. where the clock jumps to).
  const resultParts = getPartsInTimeZone(new Date(utcMs), timeZone);
  const resultDayMs = Date.UTC(
    resultParts.year,
    resultParts.month - 1,
    resultParts.day,
  );
  if (
    resultDayMs !== targetDayMs ||
    resultParts.hour * 60 + resultParts.minute !== targetMin
  ) {
    // Search for the post-gap start: first UTC where wall time is on the
    // correct date and >= the requested minute. Scan from 2 h before utcMs
    // (covers the widest DST gap in the tz database).
    const searchStart = utcMs - 2 * 3600_000;
    for (let ms = searchStart; ms <= utcMs + 3600_000; ms += 60_000) {
      const p = getPartsInTimeZone(new Date(ms), timeZone);
      if (
        Date.UTC(p.year, p.month - 1, p.day) === targetDayMs &&
        p.hour * 60 + p.minute >= targetMin
      ) {
        utcMs = ms;
        break;
      }
    }
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
