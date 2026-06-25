"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Spinner from "@/components/Spinner";
import { Course } from "@/lib/types";

export default function AdminCourseList() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/sheets/init", { method: "POST" })
      .then(() => fetch("/api/sheets/courses"))
      .then((r) => r.json())
      .then((data) => setCourses(data.courses ?? []))
      .catch(() => setError("โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex justify-center py-20">
      <Spinner className="h-8 w-8 text-[#185FA5]" />
    </div>
  );

  if (error) return (
    <div className="card text-center text-[#A32D2D] py-10">{error}</div>
  );

  if (courses.length === 0) return (
    <div className="card text-center py-16 space-y-4">
      <div className="text-gray-400">
        <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      </div>
      <p className="text-gray-500">ยังไม่มีรายวิชา</p>
      <Link href="/admin/import" className="btn-primary inline-block">นำเข้ารายชื่อนักศึกษา</Link>
    </div>
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {courses.map((course) => (
        <div key={`${course.course_id}_${course.section}`} className="card hover:border-[#185FA5] transition-colors">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="font-mono text-xs text-gray-500">{course.course_id}</p>
              <h3 className="font-semibold text-gray-900 mt-0.5 truncate">{course.title}</h3>
              <p className="text-sm text-gray-500 mt-1">
                Sec. {course.section} · ปี {course.year} เทอม {course.semester}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{course.lecturer}</p>
            </div>
            <div className="flex flex-col gap-2 ml-4">
              <Link href={`/admin/setup?course_id=${course.course_id}&section=${course.section}`} className="btn-primary text-xs px-3 py-1.5 whitespace-nowrap">
                เปิดคาบ
              </Link>
              <Link href={`/admin/summary/${course.course_id}`} className="btn-outline text-xs px-3 py-1.5 whitespace-nowrap">
                สรุป
              </Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
