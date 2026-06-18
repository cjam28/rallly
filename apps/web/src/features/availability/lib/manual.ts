import type { BusyMinutes } from "./busy";

function toDateKeyUTC(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

function minutesSinceMidnightUTC(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function addBusyRangeUTC(
  busy: BusyMinutes,
  startUTC: Date,
  endUTC: Date,
): void {
  if (endUTC <= startUTC) return;

  let cursor = new Date(startUTC);
  while (cursor < endUTC) {
    const dayStart = new Date(
      Date.UTC(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth(),
        cursor.getUTCDate(),
        0,
        0,
        0,
      ),
    );
    const nextDayStart = new Date(dayStart);
    nextDayStart.setUTCDate(nextDayStart.getUTCDate() + 1);

    const sliceEnd = endUTC < nextDayStart ? endUTC : nextDayStart;
    const dateKey = toDateKeyUTC(dayStart);

    const startMin =
      cursor.getTime() === dayStart.getTime()
        ? 0
        : minutesSinceMidnightUTC(cursor);
    const endMin =
      sliceEnd.getTime() === nextDayStart.getTime()
        ? 1440
        : minutesSinceMidnightUTC(sliceEnd);

    if (!busy[dateKey]) busy[dateKey] = [];
    busy[dateKey].push({ start: startMin, end: endMin });

    cursor = sliceEnd;
  }
}

export interface ManualBlock {
  startISO: string;
  endISO: string;
}

/**
 * Convert user-defined manual busy blocks into BusyMinutes.
 */
export function busyFromManualBlocks(blocks: ManualBlock[]): BusyMinutes {
  const busy: BusyMinutes = {};
  for (const block of blocks) {
    const start = new Date(block.startISO);
    const end = new Date(block.endISO);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      addBusyRangeUTC(busy, start, end);
    }
  }
  return busy;
}
