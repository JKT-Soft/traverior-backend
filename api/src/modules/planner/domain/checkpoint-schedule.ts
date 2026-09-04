export type CheckpointScheduleWindow = {
  start: string;
  end: string;
  days: number;
};

function parseIsoDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function addDaysIso(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  if (!date) return iso;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function inclusiveDayCount(start: string, end: string): number {
  const from = parseIsoDate(start);
  const to = parseIsoDate(end);
  if (!from || !to) return 1;
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  return days > 0 ? days : 1;
}

export function atUtcNoon(iso?: string): Date | undefined {
  if (!iso) return undefined;
  return parseIsoDate(iso) ?? undefined;
}

/** Exclusive hotel checkout: morning after the last night in this city. */
export function hotelCheckOutIso(window: Pick<CheckpointScheduleWindow, "start" | "end">): string {
  const next = addDaysIso(window.end, 1);
  return next > window.start ? next : addDaysIso(window.start, 1);
}

function distributeDays(tripDays: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  if (tripDays <= 0) return weights.map(() => 1);
  if (tripDays < n) {
    return weights.map((_, index) => (index < tripDays ? 1 : 0));
  }

  const remaining = tripDays - n;
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const shares = weights.map((weight) => (remaining * weight) / weightSum);
  const floors = shares.map((share) => Math.floor(share));
  const result = floors.map((extra) => 1 + extra);
  let leftover = remaining - floors.reduce((sum, extra) => sum + extra, 0);
  const order = shares
    .map((share, index) => ({ index, remainder: share - Math.floor(share) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; leftover > 0; i += 1, leftover -= 1) {
    result[order[i % n]!.index] += 1;
  }
  return result;
}

/**
 * Split a trip's inclusive calendar range across destination checkpoints.
 * Windows are contiguous, do not overlap, and stop on the trip end date.
 */
export function allocateCheckpointWindows(
  checkpoints: Array<{ days: number }>,
  range: { start?: string; end?: string },
): Array<CheckpointScheduleWindow | null> {
  if (checkpoints.length === 0) return [];
  if (!range.start || !parseIsoDate(range.start)) {
    return checkpoints.map(() => null);
  }

  const start = range.start;
  const weightDays = checkpoints.map((checkpoint) => Math.max(1, checkpoint.days));
  const inferredEnd = addDaysIso(start, weightDays.reduce((sum, days) => sum + days, 0) - 1);
  const end = range.end && parseIsoDate(range.end) && range.end >= start ? range.end : inferredEnd;
  const allocated = distributeDays(inclusiveDayCount(start, end), weightDays);

  let cursor = start;
  return allocated.map((days) => {
    if (days <= 0) return null;
    const windowEnd = addDaysIso(cursor, days - 1);
    const window = { start: cursor, end: windowEnd, days };
    cursor = addDaysIso(windowEnd, 1);
    return window;
  });
}
