// Shared month-grid math for the Google-Calendar-style mini widgets used on
// the Courses page (CoursesCalendar) and the admin Calendar page — kept here
// so both stay pixel-identical without duplicating the leading/trailing-day
// and UTC-boundary arithmetic.

export const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
export const THAI_DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

export interface MonthCell {
  iso: string;
  day: number;
  inMonth: boolean;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function toIso(y: number, mZeroIdx: number, d: number): string {
  return `${y}-${pad(mZeroIdx + 1)}-${pad(d)}`;
}

/** month is 0-11. Always returns full weeks (multiple of 7, at least 35 cells). */
export function getMonthCells(year: number, month: number): MonthCell[] {
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const startDow = firstOfMonth.getUTCDay(); // 0=Sun
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const daysInPrevMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const list: MonthCell[] = [];
  for (let i = 0; i < startDow; i++) {
    const d = daysInPrevMonth - startDow + 1 + i;
    const m = month === 0 ? 11 : month - 1;
    const y = month === 0 ? year - 1 : year;
    list.push({ iso: toIso(y, m, d), day: d, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    list.push({ iso: toIso(year, month, d), day: d, inMonth: true });
  }
  while (list.length % 7 !== 0 || list.length < 35) {
    const last = list[list.length - 1];
    const [y, m, d] = last.iso.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    list.push({ iso: next.toISOString().slice(0, 10), day: next.getUTCDate(), inMonth: false });
  }
  return list;
}
