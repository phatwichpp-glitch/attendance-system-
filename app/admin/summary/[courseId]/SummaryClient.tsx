"use client";
import { useState, useEffect } from "react";
import Spinner from "@/components/Spinner";
import { Course, Session, Student, AttendanceRecord } from "@/lib/types";

interface SummaryData {
  course: Course;
  sessions: Session[];
  students: Student[];
  attendance: AttendanceRecord[];
}

const STATUS_THRESHOLDS = 0.8; // 80% attendance required

export default function SummaryClient({ courseId }: { courseId: string }) {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/sheets/summary/${courseId}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [courseId]);

  if (loading) return (
    <div className="flex justify-center py-20"><Spinner className="h-8 w-8 text-[#185FA5]" /></div>
  );

  if (!data?.course) return (
    <div className="card text-center py-10 text-[#A32D2D]">ไม่พบข้อมูลรายวิชา</div>
  );

  const { course, sessions, students, attendance } = data;

  const getStatus = (studentId: string, sessionId: string) => {
    return attendance.find((a) => a.student_id === studentId && a.session_id === sessionId)?.status ?? null;
  };

  const getStudentStats = (studentId: string) => {
    const records = attendance.filter((a) => a.student_id === studentId);
    const present = records.filter((a) => a.status === "present").length;
    const late = records.filter((a) => a.status === "late").length;
    const absent = records.filter((a) => a.status === "absent").length;
    const gpsFail = records.filter((a) => a.status === "gps_fail").length;
    const total = sessions.length;
    const pct = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
    return { present, late, absent, gpsFail, pct };
  };

  const exportCsv = () => {
    const header = ["#", "รหัส", "ชื่อ", "นามสกุล",
      ...sessions.map((s) => `${s.date} คาบ${s.period}`),
      "มาทั้งหมด", "ขาด", "สาย", "%"
    ];
    const rows = students.map((s) => {
      const stats = getStudentStats(s.student_id);
      const cells = sessions.map((sess) => {
        const st = getStatus(s.student_id, sess.session_id);
        return st === "present" ? "✓" : st === "late" ? "S" : st === "absent" ? "—" : st === "gps_fail" ? "⚠" : "-";
      });
      return [s.order_num, s.student_id, s.firstname, s.lastname, ...cells,
        stats.present + stats.late, stats.absent, stats.late, `${stats.pct}%`];
    });
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `summary_${courseId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{course.title}</h1>
          <p className="text-sm text-gray-500">{course.course_id} · Sec.{course.section} · {course.lecturer}</p>
          <p className="text-xs text-gray-400 mt-0.5">ทั้งหมด {sessions.length} คาบ · {students.length} คน</p>
        </div>
        <button onClick={exportCsv} className="btn-outline text-sm flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="sticky left-0 bg-gray-50 text-left px-2 py-2 text-gray-500 font-medium text-xs border-b border-gray-200 w-6">#</th>
              <th className="sticky left-6 bg-gray-50 text-left px-3 py-2 text-gray-500 font-medium text-xs border-b border-gray-200 min-w-[7rem]">รหัส</th>
              <th className="text-left px-3 py-2 text-gray-500 font-medium text-xs border-b border-gray-200 min-w-[8rem]">ชื่อ-นามสกุล</th>
              {sessions.map((s) => (
                <th key={s.session_id} className="px-2 py-2 text-gray-500 font-medium text-xs border-b border-gray-200 text-center min-w-[3.5rem]">
                  <div>{s.date.slice(5)}</div>
                  <div className="text-gray-400">ค{s.period}</div>
                </th>
              ))}
              <th className="px-2 py-2 text-[#3B6D11] font-medium text-xs border-b border-gray-200 text-center min-w-[3rem]">มา</th>
              <th className="px-2 py-2 text-[#A32D2D] font-medium text-xs border-b border-gray-200 text-center min-w-[3rem]">ขาด</th>
              <th className="px-2 py-2 text-[#854F0B] font-medium text-xs border-b border-gray-200 text-center min-w-[3rem]">สาย</th>
              <th className="px-2 py-2 text-gray-700 font-medium text-xs border-b border-gray-200 text-center min-w-[3.5rem]">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {students.map((s) => {
              const stats = getStudentStats(s.student_id);
              const lowAttendance = stats.pct < STATUS_THRESHOLDS * 100;
              return (
                <tr key={s.student_id} className={lowAttendance ? "bg-[#FCEBEB]" : "hover:bg-gray-50"}>
                  <td className={`sticky left-0 px-2 py-2 text-gray-400 text-xs ${lowAttendance ? "bg-[#FCEBEB]" : "bg-white"}`}>{s.order_num}</td>
                  <td className={`sticky left-6 px-3 py-2 font-mono text-xs text-gray-600 ${lowAttendance ? "bg-[#FCEBEB]" : "bg-white"}`}>{s.student_id}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{s.firstname} {s.lastname}</td>
                  {sessions.map((sess) => {
                    const st = getStatus(s.student_id, sess.session_id);
                    return (
                      <td key={sess.session_id} className="px-2 py-2 text-center">
                        {st === "present" && <span className="text-[#3B6D11] font-bold">✓</span>}
                        {st === "late" && <span className="text-[#854F0B] font-bold text-xs">S</span>}
                        {st === "absent" && <span className="text-[#A32D2D]">—</span>}
                        {st === "gps_fail" && <span className="text-gray-400 text-xs">⚠</span>}
                        {!st && <span className="text-gray-200">·</span>}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-center text-[#3B6D11] font-medium">{stats.present + stats.late}</td>
                  <td className="px-2 py-2 text-center text-[#A32D2D]">{stats.absent}</td>
                  <td className="px-2 py-2 text-center text-[#854F0B]">{stats.late}</td>
                  <td className={`px-2 py-2 text-center font-medium ${lowAttendance ? "text-[#A32D2D]" : "text-gray-700"}`}>{stats.pct}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
