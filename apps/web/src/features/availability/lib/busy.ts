/**
 * Core busy-windows types and utilities, shared across all availability providers.
 *
 * BusyMinutes is keyed by YYYYMMDD date strings.
 * Each value is an array of { start, end } offsets in minutes-since-midnight UTC.
 */

export interface BusyMinutes {
  [date: string]: Array<{ start: number; end: number }>;
}

/**
 * Merge busy windows from multiple sources into one BusyMinutes map.
 * A slot is busy if ANY source is busy during it.
 */
export function mergeBusy(allBusy: BusyMinutes[]): BusyMinutes {
  const merged: BusyMinutes = {};
  for (const sourceBusy of allBusy) {
    for (const [dateKey, windows] of Object.entries(sourceBusy)) {
      if (!merged[dateKey]) merged[dateKey] = [];
      merged[dateKey].push(...windows);
    }
  }
  return merged;
}

/** True if a candidate slot (start/end in minutes) overlaps any busy window on the given day */
export function isSlotBusy(
  busy: BusyMinutes,
  dateKey: string,
  slotStart: number,
  slotEnd: number,
): boolean {
  const windows = busy[dateKey];
  if (!windows) return false;
  return windows.some((w) => slotStart < w.end && slotEnd > w.start);
}
