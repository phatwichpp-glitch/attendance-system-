import { CourseSettings, DEFAULT_SETTINGS } from "./types";

const KEY = "attendance_settings";

export function loadSettings(courseId: string): CourseSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const all = JSON.parse(raw) as Record<string, CourseSettings>;
    return { ...DEFAULT_SETTINGS, ...(all[courseId] ?? {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(courseId: string, settings: CourseSettings) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, CourseSettings>) : {};
    all[courseId] = settings;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}
