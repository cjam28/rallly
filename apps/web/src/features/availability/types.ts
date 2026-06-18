import type { BusyMinutes } from "./lib/busy";
import type { CandidateSlot } from "./lib/slot-generator";

export type AvailabilitySourceType = "ics_url" | "caldav" | "manual";
export type CalendarConnectionProvider =
  | "google-calendar"
  | "zoho-calendar"
  | "caldav";

export interface AvailabilityProviderResult {
  sourceId: string;
  label: string;
  busy: BusyMinutes;
  reconnectRequired?: boolean;
}

export interface AvailabilityPreviewParams {
  userId: string;
  participantUserIds: string[];
  additionalSourceIds: string[];
  startDate: string;
  endDate: string;
  slotDurationMins: number;
  workdayStartHour: number;
  workdayEndHour: number;
  excludeWeekends: boolean;
  timeZone: string;
}

export interface AvailabilityPreviewResult {
  slots: CandidateSlot[];
  mergedBusy: BusyMinutes;
  busyBreakdown: Array<{
    sourceId: string;
    label: string;
    busyWindowCount: number;
    reconnectRequired?: boolean;
    fetchFailed?: boolean;
    errorMessage?: string;
  }>;
}
