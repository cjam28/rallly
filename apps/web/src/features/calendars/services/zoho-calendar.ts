import "server-only";

import * as z from "zod";
import { env } from "@/env";
import type { BusyMinutes } from "@/features/availability/lib/busy";
import type {
  CalendarInfo,
  CalendarService,
} from "@/features/calendars/services/types";
import {
  parseZohoFreeBusyResponse,
  toZohoDate,
} from "@/features/calendars/services/zoho-freebusy-parser";

export type ZohoServiceParams = {
  credentials: {
    accessToken: string;
    refreshToken?: string;
  };
  email: string;
};

interface ZohoCalendarListItem {
  uid?: string;
  name?: string;
  isdefault?: boolean;
  timezone?: string;
  include_infreebusy?: boolean;
}

export class ZohoCalendarService implements CalendarService {
  static credentialsSchema = z.object({
    accessToken: z.string(),
    refreshToken: z.string().optional(),
  });

  private readonly accessToken: string;
  private readonly email: string;
  private readonly dc: string;

  constructor(readonly params: ZohoServiceParams) {
    this.accessToken = params.credentials.accessToken;
    this.email = params.email;
    this.dc = env.ZOHO_DC ?? "com";
  }

  private apiBase(): string {
    return `https://calendar.zoho.${this.dc}/api/v1`;
  }

  async listCalendars(): Promise<CalendarInfo[]> {
    const res = await fetch(`${this.apiBase()}/calendars`, {
      headers: { Authorization: `Zoho-oauthtoken ${this.accessToken}` },
    });

    if (!res.ok) {
      const err = new Error(
        `Zoho list calendars failed: ${res.status} ${await res.text()}`,
      ) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }

    const data = (await res.json()) as {
      calendars?: ZohoCalendarListItem[];
    };

    const calendars = data.calendars ?? [];
    if (calendars.length === 0) {
      return [
        {
          id: this.email,
          name: "Zoho Calendar",
          isPrimary: true,
          isSelected: true,
          isDeleted: false,
          isWritable: false,
          _rawData: { email: this.email },
        },
      ];
    }

    return calendars.map((cal) => ({
      id: cal.uid ?? this.email,
      name: cal.name ?? "Zoho Calendar",
      timeZone: cal.timezone,
      isPrimary: Boolean(cal.isdefault),
      // Seed isSelected from Zoho's own include_infreebusy setting so that
      // the user's existing Zoho preferences are respected on initial sync.
      // Default to true when the field is absent (e.g. primary calendar).
      isSelected: cal.include_infreebusy !== false,
      isDeleted: false,
      isWritable: false,
      _rawData: cal,
    }));
  }

  async queryFreeBusy(timeMin: Date, timeMax: Date): Promise<BusyMinutes> {
    return this.queryFreeBusyForCalendars([], timeMin, timeMax);
  }

  async queryFreeBusyForCalendars(
    calendarUids: string[],
    timeMin: Date,
    timeMax: Date,
  ): Promise<BusyMinutes> {
    const merged: BusyMinutes = {};
    const uids = calendarUids.length > 0 ? calendarUids : [this.email];

    for (const uid of uids) {
      const url = new URL(`${this.apiBase()}/calendars/freebusy`);
      url.searchParams.set("uid", uid);
      url.searchParams.set("uemail", this.email);
      url.searchParams.set("sdate", toZohoDate(timeMin));
      url.searchParams.set("edate", toZohoDate(timeMax));
      url.searchParams.set("ftype", "timebased");

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Zoho-oauthtoken ${this.accessToken}` },
      });

      if (!res.ok) {
        const err = new Error(
          `Zoho freebusy failed for ${uid}: ${res.status} ${await res.text()}`,
        ) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }

      const raw = (await res.json()) as Record<string, unknown>;
      const busy = parseZohoFreeBusyResponse(raw);
      for (const [dateKey, windows] of Object.entries(busy)) {
        if (!merged[dateKey]) merged[dateKey] = [];
        merged[dateKey].push(...windows);
      }
    }

    return merged;
  }

  /**
   * Fetch events from Zoho for multiple calendars within a time range.
   * Uses `byinstance:true` so recurring event instances are expanded.
   * Handles the Zoho datetime format (YYYYMMDDTHHmmss±HHmm or Z suffix).
   */
  async fetchEventsForCalendars(
    calendarUids: string[],
    timeMin: Date,
    timeMax: Date,
  ) {
    const events: Array<{
      uid: string;
      calendarId: string;
      start: Date;
      end: Date;
      summary?: string;
      raw: unknown;
    }> = [];

    for (const calendarUid of calendarUids) {
      const url = new URL(
        `${this.apiBase()}/calendars/${encodeURIComponent(calendarUid)}/events`,
      );
      url.searchParams.set(
        "range",
        JSON.stringify({
          start: toZohoDate(timeMin),
          end: toZohoDate(timeMax),
          byinstance: true,
        }),
      );

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Zoho-oauthtoken ${this.accessToken}` },
      });

      if (!res.ok) {
        const err = new Error(
          `Zoho events fetch failed for ${calendarUid}: ${res.status}`,
        ) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }

      const data = (await res.json()) as {
        events?: Array<{
          uid?: string;
          title?: string;
          dateandtime?: { start?: string; end?: string };
          start?: string;
          end?: string;
        }>;
      };

      for (const evt of data.events ?? []) {
        const startRaw = evt.dateandtime?.start ?? evt.start;
        const endRaw = evt.dateandtime?.end ?? evt.end;
        if (!startRaw || !endRaw) continue;
        const start = parseZohoDatetime(startRaw);
        const end = parseZohoDatetime(endRaw);
        if (!start || !end) continue;
        events.push({
          uid: evt.uid ?? `${calendarUid}-${startRaw}`,
          calendarId: calendarUid,
          start,
          end,
          summary: evt.title,
          raw: evt,
        });
      }
    }

    return events;
  }
}

/**
 * Parse a Zoho Calendar datetime string into a UTC Date.
 * Accepts: YYYYMMDDTHHmmss±HHmm  |  YYYYMMDDTHHmmssZ  |  ISO strings
 */
function parseZohoDatetime(s: string): Date | null {
  // Already an ISO string?
  if (s.includes("-")) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Zoho compact format: 20260618T090000+0530 or 20260618T090000Z
  const m = s.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z|[+-]\d{4})$/,
  );
  if (!m) return null;
  const [, yr, mo, dy, hr, mn, sc, tz] = m;
  const tzStr = tz === "Z" ? "Z" : `${tz.slice(0, 3)}:${tz.slice(3)}`;
  const d = new Date(`${yr}-${mo}-${dy}T${hr}:${mn}:${sc}${tzStr}`);
  return Number.isNaN(d.getTime()) ? null : d;
}
