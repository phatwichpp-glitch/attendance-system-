"use client";
import { useState, useEffect } from "react";
import Spinner from "@/components/Spinner";
import { IconDownload } from "@/components/icons";
import { Course, Session, Student, AttendanceStatus, AttendanceRecord } from "@/types";

interface SummaryData {
  course: Course;
  sessions: Session[];
  students: Student[];
  attendance: AttendanceRecord[];
  grid: Record<string, Record<string, AttendanceStatus>>;
  totals: Record<string, {
    present_count: number;
    late_count: number;
    absent_count: number;
    gps_fail_count: number;
    total_sessions: number;
    percentage: number;
  }>;
}

const THRESHOLD = 80;

export default function SummaryClient({ courseId }: { courseId: string }) {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState(THRESHOLD);

  useEffect(() => {
    fetch(`/api/sheets/summary/${courseId}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [courseId]);

  const exportCsv = () => {
    if (!data) return;
    const { course, sessions, students, grid, totals } = data;
    const header = [
      "#", "Student ID", "First Name", "Last Name",
      ...sessions.map((s) => `${s.date} P${s.period}`),
      "Present", "Absent", "Late", "%",
    ];
    const rows = students.map((s) => {
      const t = totals[s.student_id];
      const cells = sessions.map((sess) => {
        const st = grid[s.student_id]?.[sess.session_id];
        if (!st) return "-";
        return st === "present" ? "✓" : st === "late" ? "L" : st === "absent" ? "—" : "⚠";
      });
      return [
        s.order_num, s.student_id, s.firstname, s.lastname,
        ...cells,
        t ? t.present_count + t.late_count : 0,
        t?.absent_count ?? 0,
        t?.late_count ?? 0,
        t ? `${t.percentage}%` : "0%",
      ];
    });
    const csv = "﻿" + [header, ...rows].map((r) => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `summary_${course.course_id}_sec${course.section}.csv`;
    a.click();
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <Spinner className="h-8 w-8 text-[#185FA5]" />
    </div>
  );
  if (!data?.course) return (
    <div className="card text-center py-10" style={{ color: "#A32D2D" }}>ไม่พบข้อมูลรายวิชา</div>
  );

  const { course, sessions, students, grid, totals } = data;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-medium text-gray-900">{course.title}</h1>
          <p className="text-[13px] text-gray-500">
            {course.course_id} · Sec.{course.section} · {course.lecturer}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {sessions.length} sessions · {students.length} students
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-[13px] text-gray-600 flex items-center gap-2">
            Threshold
            <input
              type="number" min={0} max={100} value={threshold}
              onChange={(e) => setThreshold(parseInt(e.target.value, 10) || 0)}
              className="w-16 input text-center text-[13px] py-1"
              style={{ minHeight: 36 }}
            />
            %
          </label>
          <button onClick={exportCsv} className="btn-outline text-[13px]" style={{ minHeight: 36 }}>
            <IconDownload size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Grid — horizontal scroll with sticky cols */}
      <div className="overflow-x-auto rounded-xl" style={{ border: "0.5px solid rgba(0,0,0,0.1)" }}>
        <table className="min-w-full text-[13px] border-collapse bg-white">
          <thead>
            <tr style={{ borderBottom: "0.5px solid rgba(0,0,0,0.10)" }}>
              <th className="sticky left-0 bg-gray-50 text-left px-2 py-2.5 text-[11px] font-medium w-8" style={{ color: "#5F5E5A" }}>#</th>
              <th className="sticky left-8 bg-gray-50 text-left px-3 py-2.5 text-[11px] font-medium min-w-[7rem]" style={{ color: "#5F5E5A" }}>Student ID</th>
              <th className="sticky left-[8.5rem] bg-gray-50 text-left px-3 py-2.5 text-[11px] font-medium min-w-[9rem]" style={{ color: "#5F5E5A" }}>Name</th>
              {sessions.map((ss) => (
                <th key={ss.session_id} className="px-2 py-2.5 text-[11px] font-medium text-center min-w-[3.5rem]" style={{ color: "#5F5E5A" }}>
                  <div>{ss.date.slice(5)}</div>
                  <div className="text-gray-400 font-normal">P{ss.period}</div>
                </th>
              ))}
              <th className="px-2 py-2.5 text-[11px] font-medium text-center min-w-[2.5rem]" style={{ color: "#3B6D11" }}>Att.</th>
              <th className="px-2 py-2.5 text-[11px] font-medium text-center min-w-[2.5rem]" style={{ color: "#A32D2D" }}>Abs.</th>
              <th className="px-2 py-2.5 text-[11px] font-medium text-center min-w-[2.5rem]" style={{ color: "#185FA5" }}>Late</th>
              <th className="px-2 py-2.5 text-[11px] font-medium text-gray-700 text-center min-w-[3rem]">%</th>
            </tr>
          </thead>
          <tbody>
            {students.map((stu) => {
              const t = totals[stu.student_id];
              const low = t ? t.percentage < threshold : false;
              const rowBg = low ? "#FCEBEB" : "white";
              return (
                <tr key={stu.student_id} style={{ borderBottom: "0.5px solid rgba(0,0,0,0.06)", backgroundColor: rowBg }}>
                  <td className="sticky left-0 px-2 py-2 text-[11px] text-gray-400" style={{ backgroundColor: rowBg }}>{stu.order_num}</td>
                  <td className="sticky left-8 px-3 py-2 font-mono text-[11px] text-gray-600" style={{ backgroundColor: rowBg }}>{stu.student_id}</td>
                  <td className="sticky left-[8.5rem] px-3 py-2 whitespace-nowrap" style={{ backgroundColor: rowBg }}>{stu.firstname} {stu.lastname}</td>
                  {sessions.map((ss) => {
                    const st = grid[stu.student_id]?.[ss.session_id];
                    return (
                      <td key={ss.session_id} className="px-2 py-2 text-center">
                        {st === "present"  && <span style={{ color: "#3B6D11" }} className="font-bold">✓</span>}
                        {st === "late"     && <span style={{ color: "#185FA5" }} className="text-[11px] font-bold">L</span>}
                        {st === "absent"   && <span style={{ color: "#A32D2D" }}>—</span>}
                        {st === "gps_fail" && <span className="text-[11px]" style={{ color: "#854F0B" }}>⚠</span>}
                        {!st               && <span className="text-gray-200 text-[11px]">·</span>}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-center font-medium" style={{ color: "#3B6D11" }}>{t ? t.present_count + t.late_count : 0}</td>
                  <td className="px-2 py-2 text-center" style={{ color: "#A32D2D" }}>{t?.absent_count ?? 0}</td>
                  <td className="px-2 py-2 text-center" style={{ color: "#185FA5" }}>{t?.late_count ?? 0}</td>
                  <td className="px-2 py-2 text-center font-medium" style={{ color: low ? "#A32D2D" : "#374151" }}>{t?.percentage ?? 0}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
