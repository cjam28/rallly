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
 * Fetch Zoho Calendar free/busy for a connected user.
 * If the access token is expired or the API returns 401/403, sets reconnectRequired=true.
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
    },
    select: { providerCalendarId: true },
  });

  const calendarUids = selectedCalendars.map((c) => c.providerCalendarId);

  const service = new ZohoCalendarService({
    credentials: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    },
    email: conn.email,
  });

  try {
    const busy = await service.queryFreeBusyForCalendars(
      calendarUids,
      rangeStart,
      rangeEnd,
    );
    return { busy };
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) {
      return { busy: {}, reconnectRequired: true };
    }
    throw err;
  }
}
