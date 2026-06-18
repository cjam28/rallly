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

  async listCalendars(): Promise<CalendarInfo[]> {
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

  /**
   * Query Zoho Calendar free/busy API for the connected user.
   * Requires ZohoCalendar.freebusy.READ scope.
   */
  async queryFreeBusy(timeMin: Date, timeMax: Date): Promise<BusyMinutes> {
    const url = new URL(
      `https://calendar.zoho.${this.dc}/api/v1/calendars/freebusy`,
    );
    url.searchParams.set("uemail", this.email);
    url.searchParams.set("sdate", toZohoDate(timeMin));
    url.searchParams.set("edate", toZohoDate(timeMax));
    url.searchParams.set("ftype", "timebased");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Zoho-oauthtoken ${this.accessToken}` },
    });

    if (!res.ok) {
      const err = new Error(
        `Zoho freebusy failed for ${this.email}: ${res.status} ${await res.text()}`,
      ) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }

    const raw = (await res.json()) as Record<string, unknown>;
    return parseZohoFreeBusyResponse(raw);
  }
}
