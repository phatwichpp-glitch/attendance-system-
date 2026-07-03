"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Spinner from "@/components/Spinner";
import { Course, SemesterConfig } from "@/types";
import SemesterConfigForm, {
  DEFAULT_SEMESTER_FORM,
  SemesterFormState,
  buildTeachingSchedule,
  teachingScheduleToFormFields,
} from "@/components/SemesterConfigForm";
import { countWeeksBetween, semesterEndFromWeeks } from "@/lib/week-utils";

function configToFormState(config: SemesterConfig): SemesterFormState {
  return {
    ...DEFAULT_SEMESTER_FORM,
    ...teachingScheduleToFormFields(config.teaching_schedule),
    semester_start: config.semester_start,
    semester_end: semesterEndFromWeeks(config.semester_start, config.total_weeks),
    default_gps_radius: config.default_gps_radius,
    default_otp_min: config.default_otp_min,
    default_late_min: config.default_late_min,
    attendance_threshold: config.attendance_threshold,
    auto_open_enabled: config.auto_open_enabled ?? false,
    default_lat: config.default_lat,
    default_lng: config.default_lng,
  };
}

export default function SemesterClient({ courseId }: { courseId: string }) {
  const [course, setCourse] = useState<Course | null>(null);
  const [semester, setSemester] = useState<SemesterFormState>({ ...DEFAULT_SEMESTER_FORM });
  const [createdAt, setCreatedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const coursesRes = await fetch("/api/sheets/courses");
    const cd = await coursesRes.json();
    const c = (cd.courses ?? []).find((x: Course) => x.course_id === courseId);
    setCourse(c ?? null);

    if (c) {
      const cfgRes = await fetch(`/api/sheets/semester-config/${courseId}?section=${c.section}`);
      const cfgData = await cfgRes.json().catch(() => null);
      if (cfgData?.config) {
        setSemester(configToFormState(cfgData.config));
        setCreatedAt(cfgData.config.created_at ?? "");
      }
    }
    setLoading(false);
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!course) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const teaching_schedule = buildTeachingSchedule(semester);
      const config: Omit<SemesterConfig, "updated_at"> = {
        course_id: courseId,
        section: course.section,
        semester_start: semester.semester_start,
        total_weeks: countWeeksBetween(semester.semester_start, semester.semester_end) || 15,
        teaching_schedule,
        default_gps_radius: semester.default_gps_radius,
        default_otp_min: semester.default_otp_min,
        default_late_min: semester.default_late_min,
        attendance_threshold: semester.attendance_threshold,
        auto_open_enabled: semester.auto_open_enabled,
        default_lat: semester.default_lat,
        default_lng: semester.default_lng,
        created_at: createdAt,
      };
      const res = await fetch("/api/sheets/semester-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error("บันทึกไม่สำเร็จ");
      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex justify-center py-20"><Spinner className="h-8 w-8 text-[#185FA5]" /></div>
  );

  const needsLocation = semester.auto_open_enabled && (semester.default_lat == null || semester.default_lng == null);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-[13px] text-gray-500 mb-1">
          <Link href="/admin" style={{ color: "#185FA5" }}>Courses</Link>
          <span>›</span>
          <span>{course?.title ?? courseId}</span>
        </div>
        <h1 className="text-[18px] font-medium text-gray-900">
          {course?.title ?? courseId}
          <span className="text-[13px] font-normal text-gray-500 ml-2">
            Sec.{course?.section} · Semester Settings
          </span>
        </h1>
      </div>

      <SemesterConfigForm value={semester} onChange={setSemester} showAutoOpenToggle />

      {error && (
        <div className="rounded-lg px-4 py-3 text-[13px]" style={{ backgroundColor: "#FCEBEB", color: "#A32D2D" }}>
          {error}
        </div>
      )}
      {saved && !error && (
        <div className="rounded-lg px-4 py-3 text-[13px]" style={{ backgroundColor: "#EAF3DE", color: "#3B6D11" }}>
          บันทึกเรียบร้อยแล้ว
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={
          saving ||
          !semester.semester_start ||
          countWeeksBetween(semester.semester_start, semester.semester_end) === 0 ||
          semester.teaching_days.length === 0 ||
          needsLocation
        }
        className="btn-primary w-full py-3 text-[13px]"
      >
        {saving && <Spinner className="h-4 w-4" />}
        Save Semester Settings
      </button>
    </div>
  );
}
