import { prisma } from "@rallly/database";

export const getCalendars = async (userId: string) => {
  return await prisma.calendarConnection.findMany({
    where: {
      userId,
    },
    select: {
      id: true,
      displayName: true,
      email: true,
      provider: true,
      integrationId: true,
      providerCalendars: {
        where: {
          isDeleted: false,
        },
        select: {
          id: true,
          name: true,
          isSelected: true,
          lastSyncedAt: true,
        },
        orderBy: {
          name: "asc",
        },
      },
    },
  });
};

export const getDefaultCalendar = async (userId: string) => {
  return await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultDestinationCalendarId: true },
  });
};

export async function getCalendarDashboardData(params: {
  userId: string;
  spaceId: string;
  rangeStart: Date;
  rangeEnd: Date;
}) {
  const { userId, spaceId, rangeStart, rangeEnd } = params;

  const [cachedEvents, syncStates, pollOptions, scheduledEvents] =
    await Promise.all([
      prisma.cachedCalendarEvent.findMany({
        where: {
          userId,
          startTime: { lt: rangeEnd },
          endTime: { gt: rangeStart },
        },
        orderBy: { startTime: "asc" },
      }),
      prisma.calendarSyncState.findMany({
        where: { userId },
        select: {
          sourceId: true,
          sourceKind: true,
          lastSyncAt: true,
          lastStatus: true,
          lastError: true,
        },
      }),
      prisma.option.findMany({
        where: {
          poll: {
            spaceId,
            deleted: false,
            status: "open",
          },
          startTime: { lt: rangeEnd },
        },
        select: {
          id: true,
          startTime: true,
          duration: true,
          poll: { select: { id: true, title: true } },
        },
      }),
      prisma.scheduledEvent.findMany({
        where: {
          spaceId,
          status: { not: "canceled" },
          deletedAt: null,
          start: { lt: rangeEnd },
          end: { gt: rangeStart },
        },
        select: {
          id: true,
          title: true,
          start: true,
          end: true,
          status: true,
        },
      }),
    ]);

  return {
    cachedEvents,
    syncStates,
    pollOptions,
    scheduledEvents,
  };
}
