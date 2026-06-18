import "server-only";

import { prisma } from "@rallly/database";
import { CalDAVCalendarService } from "@/features/calendars/services/caldav-calendar";
import { loadCredential } from "@/features/credentials/queries";
import type { BusyMinutes } from "../lib/busy";

interface CalendarConnectionWithCredential {
  id: string;
  userId: string;
  provider: string;
  email: string;
  displayName: string | null;
  credential: {
    id: string;
    secret: string;
    expiresAt: Date | null;
  };
}

interface ProviderResult {
  busy: BusyMinutes;
  reconnectRequired?: boolean;
}

export async function fetchBusyFromCalDAVConnection(
  conn: CalendarConnectionWithCredential,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<ProviderResult> {
  const credential = await loadCredential(conn.credential.id);
  if (!credential || credential.type !== "caldav") {
    return { busy: {}, reconnectRequired: true };
  }

  const selectedCalendars = await prisma.providerCalendar.findMany({
    where: {
      calendarConnection: { id: conn.id },
      isDeleted: false,
      syncMode: "availability",
    },
    select: { providerCalendarId: true },
  });

  let calendarUrls = selectedCalendars.map((c) => c.providerCalendarId);
  const service = new CalDAVCalendarService({ credentials: credential.secret });

  if (calendarUrls.length === 0) {
    const listed = await service.listCalendars();
    calendarUrls = listed.map((c) => c.id);
  }

  if (calendarUrls.length === 0) {
    return { busy: {} };
  }

  try {
    const events = await service.fetchEventsForCalendars(
      calendarUrls,
      rangeStart,
      rangeEnd,
    );

    const busy: BusyMinutes = {};
    const pad = (n: number) => String(n).padStart(2, "0");
    const toDateKeyUTC = (d: Date) =>
      `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;

    for (const evt of events) {
      let cursor = new Date(evt.start);
      const end = new Date(evt.end);
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
    }

    return { busy };
  } catch {
    return { busy: {}, reconnectRequired: true };
  }
}
