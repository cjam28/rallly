import "server-only";

import { prisma } from "@rallly/database";
import { decrypt } from "@rallly/utils/encryption";
import { env } from "@/env";
import { GoogleCalendarService } from "@/features/calendars/services/google-calendar";
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
 * Fetch Google Calendar free/busy for a connected user's selected calendars.
 * If the access token is expired or the API returns 401/403, sets reconnectRequired=true.
 */
export async function fetchBusyFromGoogleCalendar(
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
      isDeleted: false,
      syncMode: "availability",
    },
    select: { providerCalendarId: true },
  });

  if (selectedCalendars.length === 0) {
    return { busy: {} };
  }

  const service = new GoogleCalendarService({
    credentials: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    },
  });

  try {
    const busy = await service.queryFreeBusy(
      selectedCalendars.map((c) => c.providerCalendarId),
      rangeStart,
      rangeEnd,
    );
    return { busy };
  } catch (err) {
    const status =
      (err as { code?: number; status?: number }).code ??
      (err as { code?: number; status?: number }).status;
    if (status === 401 || status === 403) {
      return { busy: {}, reconnectRequired: true };
    }
    throw err;
  }
}
