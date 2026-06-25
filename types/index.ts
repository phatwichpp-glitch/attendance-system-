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
}

export interface DeviceConflict {
  fingerprint: string;
  students: { student_id: string; firstname: string; lastname: string; checked_at: string; status?: string }[];
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
