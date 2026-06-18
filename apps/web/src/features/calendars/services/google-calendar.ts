import type { calendar_v3 } from "googleapis";
import { google } from "googleapis";
import * as z from "zod";
import type { BusyMinutes } from "@/features/availability/lib/busy";
import type {
  CalendarInfo,
  CalendarService,
} from "@/features/calendars/services/types";
import type { GoogleServiceParams } from "@/features/google/service";
import { GoogleService } from "@/features/google/service";

export class GoogleCalendarService
  extends GoogleService
  implements CalendarService
{
  private readonly client: calendar_v3.Calendar;
  static credentialsSchema = z.object({
    accessToken: z.string(),
    refreshToken: z.string().optional(),
  });
  constructor(params: GoogleServiceParams) {
    super(params);

    this.client = google.calendar({
      version: "v3",
      auth: this.oauth2Client,
    });
  }

  async listCalendars(): Promise<CalendarInfo[]> {
    const calendarList = await this.client.calendarList.list();

    if (!calendarList.data.items) {
      return [];
    }

    return calendarList.data.items.map((item) => ({
      id: item.id as string,
      timeZone: item.timeZone ?? undefined,
      name: item.summary ?? "No name",
      isPrimary: Boolean(item.primary),
      isSelected: Boolean(item.selected),
      isDeleted: Boolean(item.deleted),
      isWritable: item.accessRole === "owner" || item.accessRole === "writer",
      _rawData: item,
    }));
  }

  /**
   * Query Google Calendar free/busy API for the given calendar IDs and time range.
   * Requires calendar.readonly scope (already requested during OAuth connect).
   * Returns BusyMinutes keyed by YYYYMMDD UTC date strings.
   */
  async queryFreeBusy(
    calendarIds: string[],
    timeMin: Date,
    timeMax: Date,
  ): Promise<BusyMinutes> {
    const resp = await this.client.freebusy.query({
      requestBody: {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: calendarIds.map((id) => ({ id })),
      },
    });

    const busy: BusyMinutes = {};
    const calendars = resp.data.calendars ?? {};

    for (const calData of Object.values(calendars)) {
      for (const period of calData.busy ?? []) {
        if (!period.start || !period.end) continue;
        const start = new Date(period.start);
        const end = new Date(period.end);
        addBusyRangeUTC(busy, start, end);
      }
    }

    return busy;
  }
}

function toDateKeyUTC(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

function minutesSinceMidnightUTC(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function addBusyRangeUTC(busy: BusyMinutes, start: Date, end: Date): void {
  if (end <= start) return;
  let cursor = new Date(start);
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
        : minutesSinceMidnightUTC(cursor);
    const endMin =
      sliceEnd.getTime() === nextDay.getTime()
        ? 1440
        : minutesSinceMidnightUTC(sliceEnd);
    if (!busy[dateKey]) busy[dateKey] = [];
    busy[dateKey].push({ start: startMin, end: endMin });
    cursor = sliceEnd;
  }
}
