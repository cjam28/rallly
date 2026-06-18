import "server-only";

import * as ical from "node-ical";
import type { BusyMinutes } from "../lib/busy";

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

function isExcluded(exdate: unknown, dt: Date): boolean {
  if (!exdate || typeof exdate !== "object") return false;
  return Object.values(exdate as Record<string, Date>).some(
    (d) => d instanceof Date && d.getTime() === dt.getTime(),
  );
}

function eventOccurrencesInRange(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  evt: any,
  rangeStart: Date,
  rangeEnd: Date,
): Array<{ start: Date; end: Date }> {
  const out: Array<{ start: Date; end: Date }> = [];

  if (!evt.rrule) {
    if (evt.start instanceof Date && evt.end instanceof Date) {
      out.push({ start: evt.start, end: evt.end });
    }
    return out;
  }

  const durationMs =
    evt.start instanceof Date && evt.end instanceof Date
      ? evt.end.getTime() - evt.start.getTime()
      : 0;

  const overrides =
    evt.recurrences && typeof evt.recurrences === "object"
      ? (evt.recurrences as Record<string, unknown>)
      : {};

  const between = evt.rrule.between(rangeStart, rangeEnd, true) as Date[];
  for (const dt of between) {
    if (isExcluded(evt.exdate, dt)) continue;

    const override = overrides[dt.toISOString()] as
      | { start?: unknown; end?: unknown }
      | undefined;
    if (override?.start instanceof Date && override?.end instanceof Date) {
      out.push({ start: override.start, end: override.end });
      continue;
    }

    if (durationMs > 0) {
      out.push({ start: dt, end: new Date(dt.getTime() + durationMs) });
    }
  }

  return out;
}

/**
 * Fetch busy windows from an ICS subscription URL.
 * Parses VEVENT entries including recurring events with RRULE / EXDATE / recurrence overrides.
 */
export async function fetchBusyFromIcsUrl(
  url: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<BusyMinutes> {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    throw new Error(
      `ICS fetch failed for "${url}": ${res.status} ${await res.text()}`,
    );
  }

  const icsText = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed = ical.parseICS(icsText) as Record<string, any>;
  const busy: BusyMinutes = {};

  for (const evt of Object.values(parsed)) {
    if (!evt || evt.type !== "VEVENT") continue;
    for (const occ of eventOccurrencesInRange(evt, rangeStart, rangeEnd)) {
      addBusyRangeUTC(busy, new Date(occ.start), new Date(occ.end));
    }
  }

  return busy;
}
