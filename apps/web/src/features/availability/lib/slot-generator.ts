import type { BusyMinutes } from "../lib/busy";
import { isSlotBusy } from "../lib/busy";

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
  timezone?: string;
}

function toDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function formatSlotLabel(date: Date, startMin: number, endMin: number): string {
  const dayStr = date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${dayStr}, ${formatTime(startMin)} – ${formatTime(endMin)}`;
}

/**
 * Generate all candidate time slots across the date range,
 * filtering out any that overlap the merged busy windows.
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
  } = options;

  const slots: CandidateSlot[] = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T23:59:59Z`);

  while (cursor <= end) {
    const dow = cursor.getUTCDay(); // 0=Sun, 6=Sat
    if (!excludeWeekends || (dow !== 0 && dow !== 6)) {
      const dateKey = toDateKey(cursor);
      let startMin = workdayStartHour * 60;
      const endMin = workdayEndHour * 60;

      while (startMin + slotDurationMins <= endMin) {
        const slotEnd = startMin + slotDurationMins;

        if (!isSlotBusy(busy, dateKey, startMin, slotEnd)) {
          const slotStartDate = new Date(cursor);
          slotStartDate.setUTCHours(
            Math.floor(startMin / 60),
            startMin % 60,
            0,
            0,
          );
          const slotEndDate = new Date(slotStartDate);
          slotEndDate.setUTCMinutes(
            slotEndDate.getUTCMinutes() + slotDurationMins,
          );

          slots.push({
            id: slotStartDate.toISOString(),
            startISO: slotStartDate.toISOString(),
            endISO: slotEndDate.toISOString(),
            label: formatSlotLabel(slotStartDate, startMin, slotEnd),
            dateKey,
            startMin,
            endMin: slotEnd,
          });
        }

        startMin += slotDurationMins;
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return slots;
}
