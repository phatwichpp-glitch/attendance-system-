export interface Course {
  course_id: string;
  title: string;
  section: string;
  semester: string;
  year: string;
  lecturer: string;
}

export interface Student {
  student_id: string;
  firstname: string;
  lastname: string;
  course_id: string;
  section: string;
  order_num: number;
}

export interface Session {
  session_id: string;
  course_id: string;
  section: string;
  period: string;
  date: string;
  otp: string;
  lat: number;
  lng: number;
  radius_m: number;
  late_after_min: number;
  otp_expire_min: number;
  opened_at: string;
  closed_at: string;
  // Week labels
  week_number?: number;
  week_label?: string;
  is_past_session?: boolean;
  // Double period support
  period_count?: number;          // 1 (default) or 2
  period_end?: number;            // end period for single-check-in double
  check_in_mode?: "single" | "double"; // "double" = two separate check-ins
  linked_session_id?: string;     // links Part 1 ↔ Part 2
  part_number?: number;           // 1 or 2
}

export type AttendanceStatus = "present" | "late" | "absent" | "gps_fail";

export interface AttendanceRecord {
  attendance_id: string;
  session_id: string;
  course_id: string;
  student_id: string;
  firstname: string;
  lastname: string;
  status: AttendanceStatus;
  gps_pass: boolean;
  distance_m: number;
  checked_at: string;
  overridden: boolean;
  overridden_at: string;
  device_fingerprint?: string;
  // Part 5 audit trail
  edited_at?: string;
  edited_from?: string;
  edited_to?: string;
  edit_note?: string;
  is_manual_entry?: boolean;
  // Unified action system
  flagged?: boolean;
  flagged_at?: string;
  action_taken?: "approve" | "flag" | "mark_absent" | "revoke" | null;
  action_taken_at?: string;
}

export interface DeviceConflict {
  fingerprint: string;
  students: {
    student_id: string;
    firstname: string;
    lastname: string;
    checked_at: string;
    status?: string;
  }[];
}

export interface StudentWithAttendance extends Student {
  attendance?: AttendanceRecord;
}

export interface SessionWithAttendance extends Session {
  students: StudentWithAttendance[];
  spreadsheetId: string;
}

export interface SummaryData {
  course: Course;
  sessions: Session[];
  students: Student[];
  attendance: AttendanceRecord[];
  grid: Record<string, Record<string, AttendanceStatus>>;
  totals: Record<string, StudentTotals>;
}

export interface StudentTotals {
  present_count: number;
  late_count: number;
  absent_count: number;
  gps_fail_count: number;
  total_sessions: number;
  percentage: number;
}

export interface Settings {
  radius_m: number;
  otp_expire_min: number;
  late_after_min: number;
  save_gps_fail: boolean;
  warn_low_accuracy: boolean;
  show_countdown: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  radius_m: 200,
  otp_expire_min: 15,
  late_after_min: 15,
  save_gps_fail: true,
  warn_low_accuracy: true,
  show_countdown: false,
};

// Part 1 / Part 2 — Semester Config
export interface TeachingDay {
  day: number;            // 0 = Sunday … 6 = Saturday
  period: string;         // "1"–"6" nearest period label (derived from start_time)
  period_end?: number;    // end period for double periods
  period_count?: number;  // 1 (default) or 2
  check_in_mode?: "single" | "double";
  start_time?: string;    // "HH:MM" actual class start (may differ from standard period)
  end_time?: string;      // "HH:MM" actual class end
}

export interface SemesterConfig {
  course_id: string;
  section: string;
  semester_start: string;      // ISO date "YYYY-MM-DD"
  total_weeks: number;
  teaching_schedule: TeachingDay[];
  default_gps_radius: number;
  default_otp_min: number;
  default_late_min: number;
  attendance_threshold: number;
  created_at: string;
  updated_at: string;
}

export type CheckInState =
  | "loading"
  | "session_invalid"
  | "session_expired"
  | "ready"
  | "submitting"
  | "success_present"
  | "success_late"
  | "gps_fail"
  | "already_present"
  | "already_gps_fail"
  | "not_found"
  | "error";

export interface CheckInResult {
  success: boolean;
  status?: AttendanceStatus | "already_checked";
  student?: { firstname: string; lastname: string };
  checked_at?: string;
  distance_m?: number;
  gps_pass?: boolean;
  duplicate?: boolean;
  error?: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export const PERIODS = [
  { value: "1", label: "คาบ 1 (08:00–09:30)" },
  { value: "2", label: "คาบ 2 (09:30–11:00)" },
  { value: "3", label: "คาบ 3 (11:00–12:30)" },
  { value: "4", label: "คาบ 4 (13:00–14:30)" },
  { value: "5", label: "คาบ 5 (14:30–16:00)" },
  { value: "6", label: "คาบ 6 (16:00–17:30)" },
] as const;

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const DAY_NAMES_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"] as const;

// ─── Audit Log ────────────────────────────────────────────────────────────────

export interface AuditLog {
  log_id: string;
  timestamp: string;
  action: "create" | "update" | "delete";
  entity_type: "student" | "attendance" | "course" | "session";
  entity_id: string;
  changed_from: string;
  changed_to: string;
  note: string;
  actor?: string;
}
