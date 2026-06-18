import type { BusyMinutes } from "@/features/availability/lib/busy";

/** Parse "HH:MM-HH:MM" string into { start, end } minutes-since-midnight */
function parseTimeSlot(slot: string): { start: number; end: number } {
  const [s, e] = slot.split("-");
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  return { start: toMin(s), end: toMin(e) };
}

/**
 * Parse Zoho Calendar timebased freebusy API response into BusyMinutes.
 * Response shape: { "YYYYMMDD": null | [{allday?:true},...] | [null, ["HH:MM-HH:MM",...]] }
 */
export function parseZohoFreeBusyResponse(
  raw: Record<string, unknown>,
): BusyMinutes {
  const result: BusyMinutes = {};

  for (const [dateKey, dayData] of Object.entries(raw)) {
    if (!dayData || !Array.isArray(dayData) || dayData.length === 0) continue;

    const busyWindows: Array<{ start: number; end: number }> = [];

    const hasAllDay = dayData.some(
      (item) =>
        item &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        (item as { allday?: boolean }).allday,
    );
    if (hasAllDay) {
      busyWindows.push({ start: 0, end: 1440 });
    }

    const slotsArray = dayData.find(Array.isArray) as string[] | undefined;
    if (slotsArray) {
      for (const slot of slotsArray) {
        busyWindows.push(parseTimeSlot(slot));
      }
    }

    if (busyWindows.length > 0) result[dateKey] = busyWindows;
  }

  return result;
}

export function toZohoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}
