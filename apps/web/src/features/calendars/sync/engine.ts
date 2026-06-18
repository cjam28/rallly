import "server-only";

import type { Prisma } from "@rallly/database";
import { prisma } from "@rallly/database";
import { decrypt } from "@rallly/utils/encryption";
import { env } from "@/env";
import { fetchBusyFromIcsUrl } from "@/features/availability/providers/ics-url";
import { createCalendarService } from "@/features/calendars/service";
import { CalDAVCalendarService } from "@/features/calendars/services/caldav-calendar";
import { isZohoProviderCalendarDisabled } from "@/features/calendars/services/zoho-calendar";
import { refreshOAuthTokensIfNeeded } from "@/features/calendars/sync/token-refresh";
import { truncateErrorMessage } from "@/features/calendars/sync/utils";
import { loadCredential } from "@/features/credentials/queries";

export type SyncResult = {
  sourceId: string;
  ok: boolean;
  eventCount: number;
  error?: string;
};

const SYNC_FUTURE_DAYS = Number(process.env.CALENDAR_SYNC_FUTURE_DAYS ?? "180");
const SYNC_PAST_DAYS = Number(process.env.CALENDAR_SYNC_PAST_DAYS ?? "90");

function syncRange() {
  const rangeStart = new Date();
  rangeStart.setDate(rangeStart.getDate() - SYNC_PAST_DAYS);
  const rangeEnd = new Date();
  rangeEnd.setDate(rangeEnd.getDate() + SYNC_FUTURE_DAYS);
  return { rangeStart, rangeEnd };
}

async function upsertSyncState(params: {
  userId: string;
  sourceKind: string;
  sourceId: string;
  syncFrom: Date;
  status: "ok" | "error";
  error?: string;
}) {
  await prisma.calendarSyncState.upsert({
    where: { sourceId: params.sourceId },
    create: {
      userId: params.userId,
      sourceKind: params.sourceKind,
      sourceId: params.sourceId,
      syncFrom: params.syncFrom,
      lastSyncAt: new Date(),
      lastStatus: params.status,
      lastError: params.error,
    },
    update: {
      lastSyncAt: new Date(),
      lastStatus: params.status,
      lastError: params.error ?? null,
    },
  });
}

function dedupeCachedEvents<
  T extends {
    externalUid: string;
    calendarId?: string;
    startTime: Date;
    endTime: Date;
    summary?: string;
    raw?: Prisma.InputJsonValue;
  },
>(events: T[]): T[] {
  const byUid = new Map<string, T>();
  for (const evt of events) {
    byUid.set(evt.externalUid, evt);
  }
  return [...byUid.values()];
}

async function replaceCachedEvents(params: {
  userId: string;
  sourceKind: string;
  sourceId: string;
  events: Array<{
    externalUid: string;
    calendarId?: string;
    startTime: Date;
    endTime: Date;
    summary?: string;
    raw?: Prisma.InputJsonValue;
  }>;
}) {
  const now = new Date();
  const events = dedupeCachedEvents(params.events);

  await prisma.$transaction(async (tx) => {
    await tx.cachedCalendarEvent.deleteMany({
      where: { sourceId: params.sourceId },
    });

    if (events.length > 0) {
      await tx.cachedCalendarEvent.createMany({
        data: events.map((evt) => ({
          userId: params.userId,
          sourceKind: params.sourceKind,
          sourceId: params.sourceId,
          externalUid: evt.externalUid,
          calendarId: evt.calendarId,
          startTime: evt.startTime,
          endTime: evt.endTime,
          summary: evt.summary,
          raw: evt.raw,
          syncedAt: now,
        })),
        skipDuplicates: true,
      });
    }
  });
}

export async function syncCalendarConnection(
  userId: string,
  connectionId: string,
): Promise<SyncResult> {
  const connection = await prisma.calendarConnection.findFirst({
    where: { id: connectionId, userId },
    include: {
      providerCalendars: {
        where: { isDeleted: false, syncMode: { not: "none" } },
        select: {
          providerCalendarId: true,
          providerData: true,
        },
      },
    },
  });

  if (!connection) {
    return {
      sourceId: connectionId,
      ok: false,
      eventCount: 0,
      error: "not_found",
    };
  }

  const { rangeStart, rangeEnd } = syncRange();

  try {
    if (connection.provider === "caldav") {
      const credential = await loadCredential(connection.credentialId);
      if (!credential || credential.type !== "caldav") {
        throw new Error("CalDAV credentials not found");
      }

      const service = new CalDAVCalendarService({
        credentials: credential.secret,
      });
      let calendarUrls = connection.providerCalendars.map(
        (c) => c.providerCalendarId,
      );
      if (calendarUrls.length === 0) {
        const listed = await service.listCalendars();
        calendarUrls = listed.map((c) => c.id);
      }
      const events = await service.fetchEventsForCalendars(
        calendarUrls,
        rangeStart,
        rangeEnd,
      );

      await replaceCachedEvents({
        userId,
        sourceKind: "connection",
        sourceId: connection.id,
        events: events.map((e) => ({
          externalUid: e.uid,
          calendarId: e.calendarId,
          startTime: e.start,
          endTime: e.end,
          summary: e.summary,
          raw: e.raw as Prisma.InputJsonValue,
        })),
      });
      await upsertSyncState({
        userId,
        sourceKind: "connection",
        sourceId: connection.id,
        syncFrom: connection.createdAt,
        status: "ok",
      });
      return { sourceId: connection.id, ok: true, eventCount: events.length };
    }

    const credential = await loadCredential(connection.credentialId);
    if (!credential) throw new Error("Credential not found");

    await refreshOAuthTokensIfNeeded({
      userId,
      provider: connection.provider,
      providerAccountId: connection.providerAccountId,
      credentialId: connection.credentialId,
    });

    const refreshed = await loadCredential(connection.credentialId);
    if (!refreshed) throw new Error("Credential not found after refresh");

    const service = await createCalendarService({
      provider: connection.provider,
      credentials: refreshed.secret,
      email: connection.email,
    });

    const selectedIds =
      connection.provider === "zoho"
        ? connection.providerCalendars
            .filter((c) => !isZohoProviderCalendarDisabled(c.providerData))
            .map((c) => c.providerCalendarId)
        : connection.providerCalendars.map((c) => c.providerCalendarId);

    if (connection.provider === "google") {
      const google = service as InstanceType<
        typeof import("@/features/calendars/services/google-calendar").GoogleCalendarService
      >;
      const busy = await google.queryFreeBusy(
        selectedIds,
        rangeStart,
        rangeEnd,
      );
      const events = busyToEvents(busy);
      await replaceCachedEvents({
        userId,
        sourceKind: "connection",
        sourceId: connection.id,
        events,
      });
      await upsertSyncState({
        userId,
        sourceKind: "connection",
        sourceId: connection.id,
        syncFrom: connection.createdAt,
        status: "ok",
      });
      return {
        sourceId: connection.id,
        ok: true,
        eventCount: events.length,
      };
    }

    if (connection.provider === "zoho") {
      const zoho = service as InstanceType<
        typeof import("@/features/calendars/services/zoho-calendar").ZohoCalendarService
      >;

      // Fetch events per-calendar using the events API (not freebusy).
      // Batch in ≤31 day windows (Zoho API limit).
      const allEvents: Array<{
        uid: string;
        calendarId: string;
        start: Date;
        end: Date;
        summary?: string;
        raw: unknown;
      }> = [];
      const fetchWarnings: string[] = [];

      for (const window of splitInto31DayWindows(rangeStart, rangeEnd)) {
        const { events: windowEvents, warnings } =
          await zoho.fetchEventsForCalendars(
            selectedIds,
            window.start,
            window.end,
          );
        allEvents.push(...windowEvents);
        fetchWarnings.push(...warnings);
      }

      if (
        selectedIds.length > 0 &&
        allEvents.length === 0 &&
        fetchWarnings.length === selectedIds.length
      ) {
        throw new Error(fetchWarnings[0] ?? "Zoho events fetch failed");
      }

      await replaceCachedEvents({
        userId,
        sourceKind: "connection",
        sourceId: connection.id,
        events: allEvents.map((e) => ({
          externalUid: `${e.calendarId}:${e.uid}:${e.start.getTime()}`,
          calendarId: e.calendarId,
          startTime: e.start,
          endTime: e.end,
          summary: e.summary,
          raw: e.raw as import("@rallly/database").Prisma.InputJsonValue,
        })),
      });

      const partialWarning =
        fetchWarnings.length > 0
          ? truncateErrorMessage([...new Set(fetchWarnings)].join("; "))
          : undefined;

      await upsertSyncState({
        userId,
        sourceKind: "connection",
        sourceId: connection.id,
        syncFrom: connection.createdAt,
        status: "ok",
        error: partialWarning,
      });
      return {
        sourceId: connection.id,
        ok: true,
        eventCount: allEvents.length,
      };
    }

    throw new Error(`Unsupported provider: ${connection.provider}`);
  } catch (error) {
    const message = truncateErrorMessage(
      error instanceof Error ? error.message : "Sync failed",
    );
    await upsertSyncState({
      userId,
      sourceKind: "connection",
      sourceId: connection.id,
      syncFrom: connection.createdAt,
      status: "error",
      error: message,
    });
    return {
      sourceId: connection.id,
      ok: false,
      eventCount: 0,
      error: message,
    };
  }
}

export async function syncIcsSubscription(
  userId: string,
  sourceId: string,
): Promise<SyncResult> {
  const source = await prisma.availabilitySource.findFirst({
    where: { id: sourceId, userId, type: "ics_url" },
  });
  if (!source) {
    return { sourceId, ok: false, eventCount: 0, error: "not_found" };
  }

  const encryptedUrl = (source.config as { url?: string }).url;
  if (!encryptedUrl) {
    return { sourceId, ok: false, eventCount: 0, error: "missing_url" };
  }

  // Decrypt — fall back to plaintext for pre-migration rows
  let url: string;
  try {
    url = decrypt(encryptedUrl, env.SECRET_PASSWORD);
  } catch {
    url = encryptedUrl;
  }

  const { rangeStart, rangeEnd } = syncRange();

  try {
    const busy = await fetchBusyFromIcsUrl(url, rangeStart, rangeEnd);
    const events = busyToEvents(busy);
    await replaceCachedEvents({
      userId,
      sourceKind: "ics_subscription",
      sourceId: source.id,
      events,
    });
    await upsertSyncState({
      userId,
      sourceKind: "ics_subscription",
      sourceId: source.id,
      syncFrom: source.createdAt,
      status: "ok",
    });
    return { sourceId: source.id, ok: true, eventCount: events.length };
  } catch (error) {
    const message = truncateErrorMessage(
      error instanceof Error ? error.message : "ICS sync failed",
    );
    await upsertSyncState({
      userId,
      sourceKind: "ics_subscription",
      sourceId: source.id,
      syncFrom: source.createdAt,
      status: "error",
      error: message,
    });
    return { sourceId: source.id, ok: false, eventCount: 0, error: message };
  }
}

/**
 * Yield non-overlapping windows of at most 31 days covering [start, end).
 * Required because the Zoho Calendar events API has a 31-day max range.
 */
function* splitInto31DayWindows(
  start: Date,
  end: Date,
): Generator<{ start: Date; end: Date }> {
  let windowStart = new Date(start);
  while (windowStart < end) {
    const windowEnd = new Date(windowStart);
    windowEnd.setDate(windowEnd.getDate() + 31);
    if (windowEnd > end) windowEnd.setTime(end.getTime());
    yield { start: windowStart, end: windowEnd };
    windowStart = new Date(windowEnd);
  }
}

function busyToEvents(
  busy: Record<string, Array<{ start: number; end: number }>>,
) {
  const events: Array<{
    externalUid: string;
    startTime: Date;
    endTime: Date;
    summary?: string;
  }> = [];

  for (const [dateKey, windows] of Object.entries(busy)) {
    const year = Number.parseInt(dateKey.slice(0, 4), 10);
    const month = Number.parseInt(dateKey.slice(4, 6), 10) - 1;
    const day = Number.parseInt(dateKey.slice(6, 8), 10);

    for (const w of windows) {
      // Always store times as UTC milliseconds from epoch.
      // When assumeUtc=false (Zoho returns wall-clock minutes), treat the
      // dateKey as a UTC calendar date and offset by the window minutes, which
      // is the best approximation we can make without knowing the user TZ here.
      const dayStartUtc = Date.UTC(year, month, day, 0, 0, 0, 0);
      const start = new Date(dayStartUtc + w.start * 60_000);
      const end = new Date(dayStartUtc + w.end * 60_000);

      events.push({
        externalUid: `${dateKey}-${w.start}-${w.end}`,
        startTime: start,
        endTime: end,
        summary: "Busy",
      });
    }
  }

  return events;
}

export async function syncAllForUser(userId: string): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  const connections = await prisma.calendarConnection.findMany({
    where: { userId },
    select: { id: true },
  });
  for (const conn of connections) {
    results.push(await syncCalendarConnection(userId, conn.id));
  }

  const icsSources = await prisma.availabilitySource.findMany({
    where: { userId, type: "ics_url" },
    select: { id: true },
  });
  for (const src of icsSources) {
    results.push(await syncIcsSubscription(userId, src.id));
  }

  return results;
}

export async function syncAllUsers(): Promise<{
  users: number;
  results: SyncResult[];
}> {
  const userIds = await prisma.calendarConnection.findMany({
    select: { userId: true },
    distinct: ["userId"],
  });
  const icsUserIds = await prisma.availabilitySource.findMany({
    where: { type: "ics_url" },
    select: { userId: true },
    distinct: ["userId"],
  });

  const allUserIds = [
    ...new Set([
      ...userIds.map((u) => u.userId),
      ...icsUserIds.map((u) => u.userId),
    ]),
  ];

  const results: SyncResult[] = [];
  for (const userId of allUserIds) {
    results.push(...(await syncAllForUser(userId)));
  }

  return { users: allUserIds.length, results };
}

export async function getCachedBusyForSource(
  sourceId: string,
  rangeStart: Date,
  rangeEnd: Date,
) {
  const events = await prisma.cachedCalendarEvent.findMany({
    where: {
      sourceId,
      startTime: { lt: rangeEnd },
      endTime: { gt: rangeStart },
    },
    select: { startTime: true, endTime: true },
  });
  return events;
}
