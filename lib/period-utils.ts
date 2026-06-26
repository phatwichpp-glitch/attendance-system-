export const PERIOD_TIMES: Record<number, string> = {
  1: "08:00–09:30",
  2: "09:30–11:00",
  3: "11:00–12:30",
  4: "13:00–14:30",
  5: "14:30–16:00",
  6: "16:00–17:30",
};

/**
 * Returns human-readable period label.
 * Single: "คาบ 3 (11:00–12:30)"
 * Double: "คาบ 3–4 (11:00–14:30)"
 */
export function getPeriodLabel(period: number, periodEnd?: number): string {
  const start = PERIOD_TIMES[period]?.split("–")[0] ?? "";
  const end = periodEnd
    ? PERIOD_TIMES[periodEnd]?.split("–")[1] ?? ""
    : PERIOD_TIMES[period]?.split("–")[1] ?? "";
  const range = periodEnd ? `คาบ ${period}–${periodEnd}` : `คาบ ${period}`;
  return `${range} (${start}–${end})`;
}

export function getPeriodEndTime(period: number): string {
  return PERIOD_TIMES[period]?.split("–")[1] ?? "";
}

export function getPeriodStartTime(period: number): string {
  return PERIOD_TIMES[period]?.split("–")[0] ?? "";
}

/** Compute the end period given start + count. Returns undefined if count <= 1. */
export function calcPeriodEnd(period: number, count: number): number | undefined {
  if (count <= 1) return undefined;
  const end = period + count - 1;
  return end <= 6 ? end : undefined;
}
