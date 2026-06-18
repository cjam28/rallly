import "server-only";

import { prisma } from "@rallly/database";
import type { BusyMinutes } from "@/features/availability/lib/busy";
import { normalizeBusyToTimezone } from "@/features/availability/lib/timezone-busy";
import {
  cachedEventsToBusy,
  getCachedBusyForSource,
  isSyncStale,
} from "@/features/calendars/sync";

export interface CachedBusyResult {
  busy: BusyMinutes;
  fromCache: boolean;
  stale: boolean;
}

export async function getBusyFromCacheForSources(params: {
  sourceIds: string[];
  rangeStart: Date;
  rangeEnd: Date;
  timeZone: string;
}): Promise<Map<string, CachedBusyResult>> {
  const { sourceIds, rangeStart, rangeEnd, timeZone } = params;
  const results = new Map<string, CachedBusyResult>();

  if (sourceIds.length === 0) return results;

  // No userId filter: sources may belong to different users (e.g. poll participants)
  const syncStates = await prisma.calendarSyncState.findMany({
    where: { sourceId: { in: sourceIds } },
  });
  const syncBySource = new Map(syncStates.map((s) => [s.sourceId, s]));

  for (const sourceId of sourceIds) {
    const syncState = syncBySource.get(sourceId);
    const stale = isSyncStale(syncState?.lastSyncAt);
    const events = await getCachedBusyForSource(sourceId, rangeStart, rangeEnd);

    if (events.length === 0 && stale) {
      results.set(sourceId, {
        busy: {},
        fromCache: false,
        stale: true,
      });
      continue;
    }

    const rawBusy = cachedEventsToBusy(events);
    results.set(sourceId, {
      busy: normalizeBusyToTimezone(rawBusy, timeZone),
      fromCache: events.length > 0,
      stale,
    });
  }

  return results;
}
