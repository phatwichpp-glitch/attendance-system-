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

export interface AttendanceRecord {
  attendance_id: string;
  session_id: string;
  course_id: string;
  student_id: string;
  firstname: string;
  lastname: string;
  status: "present" | "late" | "absent" | "gps_fail";
  gps_pass: boolean;
  distance_m: number;
  checked_at: string;
  overridden: boolean;
  overridden_at: string;
}

export interface CourseSettings {
  radius_m: number;
  otp_expire_min: number;
  late_after_min: number;
  save_gps_fail: boolean;
  warn_low_accuracy: boolean;
  show_countdown: boolean;
}

export const DEFAULT_SETTINGS: CourseSettings = {
  radius_m: 100,
  otp_expire_min: 15,
  late_after_min: 10,
  save_gps_fail: true,
  warn_low_accuracy: true,
  show_countdown: true,
};

export interface ImportedStudent {
  order_num: number;
  student_id: string;
  firstname: string;
  lastname: string;
}

export interface ImportedData {
  course_id: string;
  title: string;
  section: string;
  lecturer: string;
  students: ImportedStudent[];
}

export interface SessionWithAttendance extends Session {
  students: StudentAttendance[];
}

export interface StudentAttendance extends Student {
  attendance?: AttendanceRecord;
}

export interface SummaryData {
  course: Course;
  sessions: Session[];
  students: Student[];
  attendance: AttendanceRecord[];
}

export const PERIODS = [
  { value: "1", label: "คาบ 1 (08:00–09:00)" },
  { value: "2", label: "คาบ 2 (09:00–10:00)" },
  { value: "3", label: "คาบ 3 (10:00–11:00)" },
  { value: "4", label: "คาบ 4 (11:00–12:00)" },
  { value: "5", label: "คาบ 5 (13:00–14:00)" },
  { value: "6", label: "คาบ 6 (14:00–15:00)" },
] as const;
