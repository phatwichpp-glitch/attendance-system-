import { Settings, DEFAULT_SETTINGS } from "@/types";

const STORAGE_KEY = "attendance_settings";

export function loadSettings(courseId: string): Settings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const all = JSON.parse(raw) as Record<string, Settings>;
    return { ...DEFAULT_SETTINGS, ...(all[courseId] ?? {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(courseId: string, settings: Settings): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, Settings>) : {};
    all[courseId] = settings;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}
