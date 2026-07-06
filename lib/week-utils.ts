const DAY_SUFFIX: Record<number, string> = {
  1: "m", 2: "t", 3: "w", 4: "th", 5: "f",
};

// Full weekday name for the suffix above — the compact "W2m"/"W2t" label isn't a
// convention teachers/students recognize on sight, so callers can show this as a
// tooltip/expansion instead of widening the grid column header itself.
const DAY_NAME_FULL: Record<number, string> = {
  1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday",
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Days-since-epoch of the Monday starting the calendar week containing `d` (UTC-based). */
function weekStartIndex(d: Date): number {
  const dayNum = Math.floor(d.getTime() / MS_PER_DAY);
  const sinceMonday = (d.getUTCDay() + 6) % 7; // 0 for Mon … 6 for Sun
  return dayNum - sinceMonday;
}

/**
 * Week numbers follow ISO calendar weeks (Mon–Sun), not 7-day blocks from
 * semester_start: week 1 is the calendar week containing semester_start, so a
 * semester opening mid-week still rolls to week 2 on the following Monday.
 */
export function getWeekNumber(sessionDate: Date, semesterStart: Date): number {
  const weeksApart = (weekStartIndex(sessionDate) - weekStartIndex(semesterStart)) / 7;
  return Math.max(1, weeksApart + 1);
}

export function getWeekLabel(
  sessionDate: Date,
  semesterStart: Date,
  teachingDays: number[]
): { weekNumber: number; label: string; fullLabel: string } {
  const weekNumber = getWeekNumber(sessionDate, semesterStart);
  // UTC, matching weekStartIndex above — every caller builds sessionDate via
  // new Date("YYYY-MM-DD") (parsed as UTC midnight), so .getDay() (local) would
  // roll back a day for any negative-UTC-offset browser/OS clock.
  const dow = sessionDate.getUTCDay();
  const multiDay = teachingDays.length > 1;
  const suffix = multiDay ? (DAY_SUFFIX[dow] ?? "") : "";
  const fullLabel = multiDay && DAY_NAME_FULL[dow]
    ? `Week ${weekNumber} — ${DAY_NAME_FULL[dow]} session`
    : `Week ${weekNumber}`;
  return { weekNumber, label: `W${weekNumber}${suffix}`, fullLabel };
}

const SUFFIX_TO_DAY_NAME: Record<string, string> = {
  m: "Monday", t: "Tuesday", w: "Wednesday", th: "Thursday", f: "Friday",
};

/**
 * Expands an already-stored compact week label (e.g. "W2t", read straight off a
 * Session row) back into a form a teacher/student recognizes without having to
 * know the m/t/w/th/f day-suffix convention — for use as a tooltip/title, not a
 * replacement for the compact grid-header label.
 */
export function expandWeekLabel(label: string): string {
  const match = /^W(\d+)(th|m|t|w|f)?$/.exec(label);
  if (!match) return label;
  const [, num, suffix] = match;
  return suffix ? `Week ${num} — ${SUFFIX_TO_DAY_NAME[suffix]} session` : `Week ${num}`;
}

/**
 * Total weeks in a semester given its first and last day (ISO "YYYY-MM-DD", inclusive).
 * Returns 0 when either date is missing/invalid or the end precedes the start.
 */
export function countWeeksBetween(semesterStartIso: string, semesterEndIso: string): number {
  if (!semesterStartIso || !semesterEndIso) return 0;
  const start = new Date(semesterStartIso);
  const end = new Date(semesterEndIso);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end.getTime() < start.getTime()) return 0;
  return getWeekNumber(end, start);
}

/**
 * Last day (Sunday) of calendar week `totalWeeks` counted from the week containing
 * semester_start — inverse of countWeeksBetween, used to show an end date for
 * configs saved before the end-date field existed.
 */
export function semesterEndFromWeeks(semesterStartIso: string, totalWeeks: number): string {
  const start = new Date(semesterStartIso);
  if (isNaN(start.getTime()) || totalWeeks < 1) return "";
  const endDayNum = weekStartIndex(start) + totalWeeks * 7 - 1;
  return new Date(endDayNum * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Given a teaching schedule, how many teaching days exist per week */
export function daysPerWeek(teachingDays: number[]): number {
  return teachingDays.length;
}

/** Given semester_start and total_weeks, how many total sessions are expected */
export function totalExpectedSessions(totalWeeks: number, teachingDays: number[]): number {
  return totalWeeks * teachingDays.length;
}

/**
 * Parse a week label like "W1m", "W2th", "W3" into { week, day }.
 * day: 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri, 0=unspecified.
 */
export function parseWeekLabel(label: string): { week: number; day: number } | null {
  const match = label.toLowerCase().match(/^w(\d+)(th|m|t|w|f)?$/);
  if (!match) return null;
  const week = parseInt(match[1], 10);
  const dayMap: Record<string, number> = { m: 1, t: 2, w: 3, th: 4, f: 5 };
  const day = match[2] ? (dayMap[match[2]] ?? 0) : 0;
  return { week, day };
}

/** Sort comparator for week labels: W1m < W1t < W1w < W1th < W1f < W2m … */
export function compareWeekLabels(a: string, b: string): number {
  const pa = parseWeekLabel(a);
  const pb = parseWeekLabel(b);
  if (!pa && !pb) return a.localeCompare(b);
  if (!pa) return 1;
  if (!pb) return -1;
  return pa.week !== pb.week ? pa.week - pb.week : pa.day - pb.day;
}
