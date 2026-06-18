import { prisma } from "@rallly/database";
import { syncCalendarConnection } from "@/features/calendars/sync";
import { loadCredential } from "@/features/credentials/queries";
import type { UserInfo } from "@/lib/oauth/types";
import { createCalendarService } from "./service";
import type { CalendarInfo } from "./services/types";

export const createCalendarConnection = async (params: {
  userId: string;
  provider: string;
  providerAccountId: string;
  integrationId: string;
  credentialId: string;
  displayName: string;
  userInfo: UserInfo;
}) => {
  const {
    userId,
    provider,
    credentialId,
    integrationId,
    providerAccountId,
    userInfo,
  } = params;

  const connection = await prisma.calendarConnection.upsert({
    where: {
      user_provider_account_unique: {
        userId,
        provider,
        providerAccountId,
      },
    },
    create: {
      userId,
      provider,
      integrationId,
      credentialId,
      providerAccountId,
      email: userInfo.email,
      displayName: params.displayName,
    },
    update: {
      credentialId,
      email: userInfo.email,
    },
  });

  return connection;
};

export const disconnectCalendarConnection = async (
  userId: string,
  id: string,
) => {
  const connection = await prisma.calendarConnection.findFirst({
    where: { id, userId },
  });

  if (!connection) {
    return {
      success: false,
      error: "Calendar connection not found" as const,
    };
  }

  return await prisma.calendarConnection.delete({
    where: { id },
  });
};

/**
 * Syncs calendars from the provider, including detection of deleted calendars.
 * When a calendar is deleted on Google, it will be marked as deleted in our database.
 */
export const syncCalendars = async ({
  userId,
  connectionId,
}: {
  userId: string;
  connectionId: string;
}) => {
  const connection = await prisma.calendarConnection.findFirst({
    where: { id: connectionId, userId },
  });

  if (!connection) {
    return {
      success: false,
      error: "Calendar connection not found" as const,
    };
  }

  const credential = await loadCredential(connection.credentialId);

  if (!credential) {
    return {
      success: false,
      error: "Credential not found" as const,
    };
  }

  const calendarService = await createCalendarService({
    provider: connection.provider,
    credentials: credential.secret,
    email: connection.email,
  });

  let calendars: CalendarInfo[];
  try {
    calendars = await calendarService.listCalendars();
  } catch (error) {
    if (isCalendarAuthError(error)) {
      return {
        success: false,
        error: "reconnect_required" as const,
      };
    }
    throw error;
  }

  await prisma.$transaction(async (tx) => {
    // Get current calendar IDs from the provider response
    const providerCalendarIds = calendars.map((cal) => cal.id);

    // Mark any calendars not in the response as deleted
    // (This handles calendars deleted from Google that aren't returned even with showDeleted=true)
    const deletedCalendars = await tx.providerCalendar.findMany({
      where: {
        calendarConnectionId: connection.id,
        providerCalendarId: {
          notIn: providerCalendarIds,
        },
        isDeleted: false,
      },
      select: { id: true },
    });

    if (deletedCalendars.length > 0) {
      const deletedCalendarIds = deletedCalendars.map((cal) => cal.id);

      // Clear any users who have a deleted calendar as their default destination
      await tx.user.updateMany({
        where: {
          defaultDestinationCalendarId: {
            in: deletedCalendarIds,
          },
        },
        data: {
          defaultDestinationCalendarId: null,
        },
      });

      await tx.providerCalendar.updateMany({
        where: { id: { in: deletedCalendarIds } },
        data: { isDeleted: true, lastSyncedAt: new Date() },
      });
    }

    // Upsert calendars from the provider response
    for (const calendar of calendars) {
      await tx.providerCalendar.upsert({
        where: {
          connection_calendar_unique: {
            calendarConnectionId: connection.id,
            providerCalendarId: calendar.id,
          },
        },
        create: {
          calendarConnectionId: connection.id,
          providerCalendarId: calendar.id,
          name: calendar.name,
          timeZone: calendar.timeZone,
          isPrimary: calendar.isPrimary,
          isSelected: calendar.isSelected,
          isDeleted: calendar.isDeleted ?? false,
          isWritable: calendar.isWritable,
          providerData: calendar._rawData,
        },
        update: {
          // Only update provider-controlled fields, preserve user customizations
          name: calendar.name,
          timeZone: calendar.timeZone,
          isPrimary: calendar.isPrimary,
          isDeleted: calendar.isDeleted ?? false,
          isWritable: calendar.isWritable,
          lastSyncedAt: new Date(),
          providerData: calendar._rawData,
        },
      });
    }
  });

  await syncCalendarConnection(userId, connectionId);

  return { success: true };
};

export const connectCalDAV = async (params: {
  userId: string;
  serverUrl: string;
  username: string;
  password: string;
  calendarPath?: string;
  displayName?: string;
}) => {
  const {
    userId,
    serverUrl,
    username,
    password,
    calendarPath,
    displayName = "CalDAV",
  } = params;

  const providerAccountId = `${serverUrl}::${username}`;

  const { saveCalDAVCredentials } = await import(
    "@/features/credentials/caldav"
  );
  const credential = await saveCalDAVCredentials({
    userId,
    providerAccountId,
    credentials: { serverUrl, username, password, calendarPath },
  });

  const connection = await prisma.calendarConnection.upsert({
    where: {
      user_provider_account_unique: {
        userId,
        provider: "caldav",
        providerAccountId,
      },
    },
    create: {
      userId,
      provider: "caldav",
      integrationId: "caldav",
      credentialId: credential.id,
      providerAccountId,
      email: username,
      displayName,
    },
    update: {
      credentialId: credential.id,
      displayName,
    },
  });

  // Migrate legacy AvailabilitySource caldav rows for this user
  const legacySources = await prisma.availabilitySource.findMany({
    where: { userId, type: "caldav" },
  });
  for (const legacy of legacySources) {
    const cfg = legacy.config as {
      serverUrl?: string;
      username?: string;
    };
    if (cfg.serverUrl === serverUrl && cfg.username === username) {
      await prisma.availabilitySource.delete({ where: { id: legacy.id } });
    }
  }

  await syncCalendars({ userId, connectionId: connection.id });

  return connection;
};

function isCalendarAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as {
    code?: number;
    status?: number;
    response?: { status?: number };
  };
  const status = e.status ?? e.code ?? e.response?.status;
  return status === 401 || status === 403;
}

export const setCalendarSelection = async (params: {
  userId: string;
  calendarId: string;
  isSelected: boolean;
}) => {
  const { userId, calendarId, isSelected } = params;

  const calendar = await prisma.providerCalendar.findFirst({
    where: { id: calendarId, calendarConnection: { userId } },
  });

  if (!calendar) {
    return { success: false, error: "Calendar not found" as const };
  }

  await prisma.providerCalendar.update({
    where: { id: calendarId },
    data: {
      isSelected,
    },
  });

  return { success: true };
};

export const setDefaultCalendar = async ({
  userId,
  calendarId,
}: {
  userId: string;
  calendarId: string | null;
}) => {
  if (calendarId) {
    const calendar = await prisma.providerCalendar.findFirst({
      where: { id: calendarId },
      select: {
        calendarConnectionId: true,
        calendarConnection: {
          select: { userId: true },
        },
      },
    });

    if (!calendar) {
      return { success: false, error: "Calendar not found" as const };
    }

    if (calendar.calendarConnection.userId !== userId) {
      return {
        success: false,
        error: "Calendar does not belong to user" as const,
      };
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { defaultDestinationCalendarId: calendarId },
  });

  return { success: true };
};
