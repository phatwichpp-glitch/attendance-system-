"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Spinner from "@/components/Spinner";
import { IconList } from "@/components/icons";
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
    return <div className="card text-center py-10 text-[#A32D2D]">{error}</div>;
  }

  if (courses.length === 0) {
    return (
      <div className="card text-center py-16 space-y-4">
        <IconList className="mx-auto text-gray-300" size={48} />
        <p className="text-gray-500">ยังไม่มีรายวิชา</p>
        <Link href="/admin/import" className="btn-primary">
          Import Students
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
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#185FA5")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)")}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[11px]" style={{ color: "#5F5E5A" }}>{c.course_id}</p>
              <h3 className="font-medium text-gray-900 truncate mt-0.5">{c.title}</h3>
              <p className="text-[13px] text-gray-500 mt-1">
                Sec.{c.section} · Year {c.year} Sem {c.semester}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">{c.lecturer}</p>
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0">
              <Link
                href={`/admin/setup?course_id=${c.course_id}&section=${c.section}`}
                className="btn-primary text-[13px] px-3"
                style={{ minHeight: 36 }}
              >
                Open Session
              </Link>
              <Link
                href={`/admin/summary/${c.course_id}`}
                className="btn-outline text-[13px] px-3"
                style={{ minHeight: 36 }}
              >
                Summary
              </Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
