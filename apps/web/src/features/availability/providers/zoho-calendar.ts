import "server-only";

import { prisma } from "@rallly/database";
import { decrypt } from "@rallly/utils/encryption";
import { env } from "@/env";
import { ZohoCalendarService } from "@/features/calendars/services/zoho-calendar";
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

/**
 * Fetch Zoho Calendar free/busy for a connected user using the per-calendar
 * events API (ZohoCalendar.event.READ scope) instead of the account-wide
 * freebusy endpoint, which cannot be filtered per-calendar.
 *
 * Only calendars where syncMode is "availability" (the default) are included.
 */
export async function fetchBusyFromZohoCalendar(
  conn: CalendarConnectionWithCredential,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<ProviderResult> {
  let tokens: { accessToken: string; refreshToken?: string };
  try {
    tokens = JSON.parse(decrypt(conn.credential.secret, env.SECRET_PASSWORD));
  } catch {
    return { busy: {}, reconnectRequired: true };
  }

  const selectedCalendars = await prisma.providerCalendar.findMany({
    where: {
      calendarConnection: { id: conn.id },
      isSelected: true,
      isDeleted: false,
      syncMode: "availability",
    },
    select: { providerCalendarId: true },
  });

  if (selectedCalendars.length === 0) {
    return { busy: {} };
  }

  const calendarUids = selectedCalendars.map((c) => c.providerCalendarId);

  const service = new ZohoCalendarService({
    credentials: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    },
    email: conn.email,
  });

  try {
    const events = await service.fetchEventsForCalendars(
      calendarUids,
      rangeStart,
      rangeEnd,
    );
    const busy = eventsToBusyMinutes(events);
    return { busy };
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) {
      return { busy: {}, reconnectRequired: true };
    }
    throw err;
  }
}

/**
 * Convert a list of calendar events into the BusyMinutes format.
 * Events are split at UTC midnight boundaries so each day key covers its
 * portion. start/end are minutes-since-midnight in UTC.
 */
function eventsToBusyMinutes(
  events: Array<{ start: Date; end: Date }>,
): BusyMinutes {
  const busy: BusyMinutes = {};

  for (const evt of events) {
    let cursor = new Date(
      Date.UTC(
        evt.start.getUTCFullYear(),
        evt.start.getUTCMonth(),
        evt.start.getUTCDate(),
      ),
    );

    while (cursor < evt.end) {
      const y = cursor.getUTCFullYear();
      const mo = cursor.getUTCMonth();
      const d = cursor.getUTCDate();
      const dateKey = `${y}${String(mo + 1).padStart(2, "0")}${String(d).padStart(2, "0")}`;

      const dayStartMs = cursor.getTime();
      const dayEndMs = dayStartMs + 86_400_000;

      const sliceStart = Math.max(evt.start.getTime(), dayStartMs);
      const sliceEnd = Math.min(evt.end.getTime(), dayEndMs);

      if (!busy[dateKey]) busy[dateKey] = [];
      busy[dateKey].push({
        start: Math.floor((sliceStart - dayStartMs) / 60_000),
        end: Math.min(Math.ceil((sliceEnd - dayStartMs) / 60_000), 1440),
      });

      cursor = new Date(dayEndMs);
    }
  }

  return busy;
}
