import "server-only";

import * as z from "zod";
import {
  createCalDAVClientWithDiscovery,
  normalizeCalDAVServerUrl,
} from "@/features/calendars/services/caldav-url";
import type {
  CalendarInfo,
  CalendarService,
} from "@/features/calendars/services/types";

export type CalDAVCredentials = {
  serverUrl: string;
  username: string;
  password: string;
  calendarPath?: string;
};

export type CalDAVServiceParams = {
  credentials: CalDAVCredentials;
};

export const caldavServerUrlSchema = z.preprocess(
  (val) => (typeof val === "string" ? normalizeCalDAVServerUrl(val) : val),
  z.string().url(),
);

export class CalDAVCalendarService implements CalendarService {
  static credentialsSchema = z.object({
    serverUrl: caldavServerUrlSchema,
    username: z.string().min(1),
    password: z.string().min(1),
    calendarPath: z.string().optional(),
  });

  private readonly credentials: CalDAVCredentials;

  constructor(params: CalDAVServiceParams) {
    this.credentials = CalDAVCalendarService.credentialsSchema.parse(
      params.credentials,
    );
  }

  private async getClient() {
    const { client } = await createCalDAVClientWithDiscovery(this.credentials);
    return client;
  }

  async listCalendars(): Promise<CalendarInfo[]> {
    const client = await this.getClient();
    const calendars = await client.fetchCalendars();

    return calendars.map((cal, index) => ({
      id: cal.url ?? `caldav-${index}`,
      name:
        typeof cal.displayName === "string"
          ? cal.displayName
          : (cal.url ?? "CalDAV Calendar"),
      isPrimary: index === 0,
      isSelected: true,
      isDeleted: false,
      isWritable: false,
      _rawData: cal,
    }));
  }

  async fetchEventsForCalendars(
    calendarUrls: string[],
    rangeStart: Date,
    rangeEnd: Date,
  ) {
    const client = await this.getClient();
    const calendars = await client.fetchCalendars();
    const selected = calendars.filter((c) =>
      calendarUrls.includes(c.url ?? ""),
    );

    const events: Array<{
      uid: string;
      calendarId: string;
      start: Date;
      end: Date;
      summary?: string;
      raw: unknown;
    }> = [];

    for (const calendar of selected) {
      const objects = await client.fetchCalendarObjects({
        calendar,
        timeRange: {
          start: rangeStart.toISOString(),
          end: rangeEnd.toISOString(),
        },
        expand: true,
      });

      for (const obj of objects) {
        if (!obj.data) continue;
        const uidMatch = obj.data.match(/UID:([^\r\n]+)/);
        const uid = uidMatch?.[1]?.trim() ?? obj.url ?? crypto.randomUUID();
        const dtStartMatch = obj.data.match(/DTSTART[^:]*:([^\r\n]+)/);
        const dtEndMatch = obj.data.match(/DTEND[^:]*:([^\r\n]+)/);
        if (!dtStartMatch) continue;

        const start = parseIcsDate(dtStartMatch[1]);
        const end = dtEndMatch
          ? parseIcsDate(dtEndMatch[1])
          : new Date(start.getTime() + 60 * 60 * 1000);

        events.push({
          uid,
          calendarId: calendar.url ?? "",
          start,
          end,
          summary: obj.data.match(/SUMMARY:([^\r\n]+)/)?.[1],
          raw: { url: obj.url },
        });
      }
    }

    return events;
  }
}

function parseIcsDate(value: string): Date {
  if (value.length === 8) {
    const y = value.slice(0, 4);
    const m = value.slice(4, 6);
    const d = value.slice(6, 8);
    return new Date(`${y}-${m}-${d}T00:00:00Z`);
  }
  if (value.endsWith("Z")) {
    return new Date(
      `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`,
    );
  }
  return new Date(value);
}
