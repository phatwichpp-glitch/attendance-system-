const DAY_SUFFIX: Record<number, string> = {
  1: "m", 2: "t", 3: "w", 4: "th", 5: "f",
};

export function getWeekNumber(sessionDate: Date, semesterStart: Date): number {
  const diffMs = sessionDate.getTime() - semesterStart.getTime();
  // Use integer day arithmetic — Math.ceil breaks when diffMs is an exact multiple of 7 days
  // (e.g. exactly 1 week gives ceil(1.0)=1 instead of 2).
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  return Math.max(1, Math.floor(diffDays / 7) + 1);
}

export function getWeekLabel(
  sessionDate: Date,
  semesterStart: Date,
  teachingDays: number[],
  _unused?: number
): { weekNumber: number; label: string } {
  const weekNumber = getWeekNumber(sessionDate, semesterStart);
  const dow = sessionDate.getDay();
  const suffix = teachingDays.length > 1 ? (DAY_SUFFIX[dow] ?? "") : "";
  return { weekNumber, label: `W${weekNumber}${suffix}` };
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
