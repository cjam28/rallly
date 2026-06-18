export function formatLastSynced(
  date: Date | null | undefined,
  neverLabel: string,
): string {
  if (!date) return neverLabel;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function maxLastSyncedAt(
  dates: Array<Date | null | undefined>,
): Date | undefined {
  let max: Date | undefined;
  for (const d of dates) {
    if (!d) continue;
    if (!max || d > max) max = d;
  }
  return max;
}
