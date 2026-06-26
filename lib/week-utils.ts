export function getWeekNumber(sessionDate: Date, semesterStart: Date): number {
  const diffMs = sessionDate.getTime() - semesterStart.getTime();
  const week = Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, week);
}

export function getWeekLabel(
  sessionDate: Date,
  semesterStart: Date,
  teachingDays: number[],
  existingSessionsThisWeek: number
): { weekNumber: number; label: string } {
  const weekNumber = getWeekNumber(sessionDate, semesterStart);
  const suffix = teachingDays.length > 1
    ? (existingSessionsThisWeek === 0 ? "a" : "b")
    : "";
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
