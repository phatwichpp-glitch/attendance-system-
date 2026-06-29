import { Settings, DEFAULT_SETTINGS } from "@/types";

const STORAGE_KEY = "attendance_settings";
const PERIOD_KEY  = "attendance_period_prefs";

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

export interface PeriodPrefs {
  period: string;
  period_count: 1 | 2;
  check_in_mode: "single" | "double";
}

export function loadPeriodPrefs(courseId: string): PeriodPrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PERIOD_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw) as Record<string, PeriodPrefs>;
    return all[courseId] ?? null;
  } catch {
    return null;
  }
}

export function savePeriodPrefs(courseId: string, prefs: PeriodPrefs): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(PERIOD_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, PeriodPrefs>) : {};
    all[courseId] = prefs;
    localStorage.setItem(PERIOD_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}
