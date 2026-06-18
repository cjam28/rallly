import "server-only";

import * as ical from "node-ical";
import type { DAVCalendar } from "tsdav";
import { createDAVClient } from "tsdav";
import type { BusyMinutes } from "../lib/busy";

export interface CalDAVConfig {
  serverUrl: string;
  username: string;
  password: string;
  calendarPath?: string;
}

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

/**
 * Fetch busy windows from a CalDAV calendar using read-only calendar-query.
 */
export async function fetchBusyFromCalDAV(
  config: CalDAVConfig,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<BusyMinutes> {
  const client = await createDAVClient({
    serverUrl: config.serverUrl,
    credentials: {
      username: config.username,
      password: config.password,
    },
    authMethod: "Basic",
    defaultAccountType: "caldav",
  });

  const calendars = await client.fetchCalendars();
  const calendar =
    calendars.find((c: DAVCalendar) => c.url === config.calendarPath) ??
    calendars.find((c: DAVCalendar) =>
      c.url?.endsWith(config.calendarPath ?? ""),
    ) ??
    calendars[0];

  if (!calendar) {
    throw new Error("No CalDAV calendar found");
  }

  const objects = await client.fetchCalendarObjects({
    calendar,
    timeRange: {
      start: rangeStart.toISOString(),
      end: rangeEnd.toISOString(),
    },
    expand: true,
  });

  const busy: BusyMinutes = {};

  for (const obj of objects) {
    if (!obj.data) continue;
    // biome-ignore lint/suspicious/noExplicitAny: node-ical returns loosely typed event objects
    const parsed = ical.parseICS(obj.data) as Record<string, any>;
    for (const evt of Object.values(parsed)) {
      if (!evt || evt.type !== "VEVENT") continue;
      if (evt.start instanceof Date && evt.end instanceof Date) {
        addBusyRangeUTC(busy, evt.start, evt.end);
      }
    }
  }

  return busy;
}
