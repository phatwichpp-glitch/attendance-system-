/**
 * Today's date as "YYYY-MM-DD" in the browser's local timezone.
 * `new Date().toISOString()` is UTC — in Thailand (UTC+7) it still reports
 * *yesterday* until 07:00, which put the wrong date on sessions opened before
 * an early-morning class. Client code must use this instead.
 */
export function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
