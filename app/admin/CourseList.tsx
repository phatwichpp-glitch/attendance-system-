"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Spinner from "@/components/Spinner";
import { Course } from "@/types";

async function fetchWithRetry(url: string, opts?: RequestInit, retries = 3): Promise<Response> {
  try {
    return await fetch(url, opts);
  } catch (e) {
    if (retries > 1) {
      await new Promise((r) => setTimeout(r, 1000 * (4 - retries)));
      return fetchWithRetry(url, opts, retries - 1);
    }
    throw e;
  }
}

export default function CourseList() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchWithRetry("/api/sheets/init", { method: "POST" })
      .then(() => fetchWithRetry("/api/sheets/courses"))
      .then((r) => r.json())
      .then((d) => setCourses(d.courses ?? []))
      .catch(() => setError("โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8 text-[#185FA5]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card text-center py-10 text-[#A32D2D]">{error}</div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="card text-center py-16 space-y-4">
        <svg className="w-12 h-12 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <p className="text-gray-500">ยังไม่มีรายวิชา</p>
        <Link href="/admin/import" className="btn-primary">
          นำเข้ารายชื่อนักศึกษา
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {courses.map((c) => (
        <div
          key={`${c.course_id}_${c.section}`}
          className="card"
          style={{ transition: "border-color 0.15s" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.borderColor = "#185FA5")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.borderColor = "rgba(0,0,0,0.12)")
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs text-gray-400">{c.course_id}</p>
              <h3 className="font-semibold text-gray-900 truncate mt-0.5">
                {c.title}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Sec.{c.section} · ปี {c.year} เทอม {c.semester}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{c.lecturer}</p>
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0">
              <Link
                href={`/admin/setup?course_id=${c.course_id}&section=${c.section}`}
                className="btn-primary text-xs px-3 py-1.5"
              >
                เปิดคาบ
              </Link>
              <Link
                href={`/admin/summary/${c.course_id}`}
                className="btn-outline text-xs px-3 py-1.5"
              >
                สรุป
              </Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
