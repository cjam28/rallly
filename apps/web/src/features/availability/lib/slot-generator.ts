import type { BusyMinutes } from "../lib/busy";
import { isSlotBusy } from "../lib/busy";
import {
  dayOfWeekInTimeZone,
  incrementDateKey,
  wallTimeToUtc,
} from "./timezone-wall";

export interface CandidateSlot {
  id: string;
  startISO: string;
  endISO: string;
  label: string;
  dateKey: string;
  startMin: number;
  endMin: number;
}

export interface SlotOptions {
  startDate: string;
  endDate: string;
  slotDurationMins: number;
  workdayStartHour: number;
  workdayEndHour: number;
  excludeWeekends?: boolean;
  timeZone: string;
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function formatSlotLabel(
  dateKey: string,
  startMin: number,
  endMin: number,
  timeZone: string,
): string {
  const probe = wallTimeToUtc(dateKey, startMin, timeZone);
  const dayStr = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(probe);
  return `${dayStr}, ${formatTime(startMin)} – ${formatTime(endMin)}`;
}

/**
 * Generate candidate time slots in the poll timezone, filtering overlaps with busy windows.
 */
export function generateFreeSlots(
  options: SlotOptions,
  busy: BusyMinutes,
): CandidateSlot[] {
  const {
    startDate,
    endDate,
    slotDurationMins,
    workdayStartHour,
    workdayEndHour,
    excludeWeekends = true,
    timeZone,
  } = options;

  const slots: CandidateSlot[] = [];
  let dateKey = startDate.replace(/-/g, "");
  const endKey = endDate.replace(/-/g, "");

  while (dateKey <= endKey) {
    const dayProbe = wallTimeToUtc(dateKey, 12 * 60, timeZone);
    const dow = dayOfWeekInTimeZone(dayProbe, timeZone);

    if (!excludeWeekends || (dow !== 0 && dow !== 6)) {
      let startMin = workdayStartHour * 60;
      const dayEndMin = workdayEndHour * 60;

      while (startMin + slotDurationMins <= dayEndMin) {
        const slotEnd = startMin + slotDurationMins;

        if (!isSlotBusy(busy, dateKey, startMin, slotEnd)) {
          const slotStartUtc = wallTimeToUtc(dateKey, startMin, timeZone);
          const slotEndUtc = wallTimeToUtc(dateKey, slotEnd, timeZone);

          slots.push({
            id: slotStartUtc.toISOString(),
            startISO: slotStartUtc.toISOString(),
            endISO: slotEndUtc.toISOString(),
            label: formatSlotLabel(dateKey, startMin, slotEnd, timeZone),
            dateKey,
            startMin,
            endMin: slotEnd,
          });
        }

        startMin += slotDurationMins;
      }
    }

    dateKey = incrementDateKey(dateKey);
  }

  return slots;
}
