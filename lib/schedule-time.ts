// Asia/Bangkok-local day/time helpers for matching the auto-open scheduler's "now"
// against each course's teaching_schedule, independent of the server OS timezone
// (nothing else in this codebase does timezone-aware date handling today — all other
// dates are server-local `Date`/`.toISOString()`).

export interface BangkokNow {
  dayOfWeek: number; // 0=Sun..6=Sat, matches TeachingDay.day
  hhmm: string;      // "HH:MM" 24h, zero-padded
  dateStr: string;   // "YYYY-MM-DD" in Asia/Bangkok
}

const WEEKDAY_TO_NUMBER: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Bangkok",
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function getBangkokNow(at: Date = new Date()): BangkokNow {
  const parts = formatter.formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  const weekday = get("weekday");
  // "24" shows up for midnight under hour12:false in some ICU versions — normalize to "00"
  const hour = get("hour") === "24" ? "00" : get("hour");
  const minute = get("minute");

  return {
    dayOfWeek: WEEKDAY_TO_NUMBER[weekday] ?? at.getUTCDay(),
    hhmm: `${hour}:${minute}`,
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** True if `nowHHMM` falls within [startHHMM, startHHMM + windowMinutes). */
export function isWithinOpenWindow(nowHHMM: string, startHHMM: string, windowMinutes: number): boolean {
  const now = toMinutes(nowHHMM);
  const start = toMinutes(startHHMM);
  return now >= start && now < start + windowMinutes;
}
