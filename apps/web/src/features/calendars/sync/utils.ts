import "server-only";

import type { BusyMinutes } from "@/features/availability/lib/busy";

const STALE_MINUTES = Number(process.env.CALENDAR_SYNC_STALE_MINUTES ?? "30");

export function isSyncStale(lastSyncAt: Date | null | undefined): boolean {
  if (!lastSyncAt) return true;
  const ageMs = Date.now() - lastSyncAt.getTime();
  return ageMs > STALE_MINUTES * 60 * 1000;
}

export function cachedEventsToBusy(
  events: Array<{ startTime: Date; endTime: Date }>,
): BusyMinutes {
  const busy: BusyMinutes = {};

  const pad = (n: number) => String(n).padStart(2, "0");
  const toDateKeyUTC = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;

  const addRange = (start: Date, end: Date) => {
    if (end <= start) return;
    let cursor = new Date(start);
    while (cursor < end) {
      const dayStart = new Date(
        Date.UTC(
          cursor.getUTCFullYear(),
          cursor.getUTCMonth(),
          cursor.getUTCDate(),
        ),
      );
      const nextDay = new Date(dayStart);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const sliceEnd = end < nextDay ? end : nextDay;
      const dateKey = toDateKeyUTC(dayStart);
      const startMin =
        cursor.getTime() === dayStart.getTime()
          ? 0
          : cursor.getUTCHours() * 60 + cursor.getUTCMinutes();
      const endMin =
        sliceEnd.getTime() === nextDay.getTime()
          ? 1440
          : sliceEnd.getUTCHours() * 60 + sliceEnd.getUTCMinutes();
      if (!busy[dateKey]) busy[dateKey] = [];
      busy[dateKey].push({ start: startMin, end: endMin });
      cursor = sliceEnd;
    }
  };

  for (const evt of events) {
    addRange(evt.startTime, evt.endTime);
  }

  return busy;
}

export function truncateErrorMessage(message: string, max = 120): string {
  const sanitized = message.replace(/password|token|secret/gi, "[redacted]");
  return sanitized.length > max ? `${sanitized.slice(0, max - 1)}…` : sanitized;
}
