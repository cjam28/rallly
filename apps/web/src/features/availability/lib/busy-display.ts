import type { BusyMinutes } from "./busy";

export interface BusyWindowEvent {
  start: Date;
  end: Date;
}

/** Convert BusyMinutes (YYYYMMDD keys, minute offsets) to calendar events */
export function busyMinutesToEvents(busy: BusyMinutes): BusyWindowEvent[] {
  const events: BusyWindowEvent[] = [];

  for (const [dateKey, windows] of Object.entries(busy)) {
    if (!Array.isArray(windows)) continue;
    const year = Number.parseInt(dateKey.slice(0, 4), 10);
    const month = Number.parseInt(dateKey.slice(4, 6), 10) - 1;
    const day = Number.parseInt(dateKey.slice(6, 8), 10);

    for (const window of windows) {
      events.push({
        start: new Date(
          Date.UTC(
            year,
            month,
            day,
            Math.floor(window.start / 60),
            window.start % 60,
          ),
        ),
        end: new Date(
          Date.UTC(
            year,
            month,
            day,
            Math.floor(window.end / 60),
            window.end % 60,
          ),
        ),
      });
    }
  }

  return events;
}

export function dateHasBusyWindows(busy: BusyMinutes, date: Date): boolean {
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateKey = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
  const windows = busy[dateKey];
  return Array.isArray(windows) && windows.length > 0;
}
