"use client";
import { useState, useEffect, useRef } from "react";
import Spinner from "@/components/Spinner";
import { IconDownload } from "@/components/icons";
import { Course, Session, Student, AttendanceStatus, AttendanceRecord, SemesterConfig } from "@/types";
import { compareWeekLabels } from "@/lib/week-utils";

interface SummaryData {
  course: Course;
  sessions: Session[];
  students: Student[];
  attendance: AttendanceRecord[];
  grid: Record<string, Record<string, AttendanceStatus | "overridden">>;
  totals: Record<string, {
    present_count: number;
    late_count: number;
    absent_count: number;
    gps_fail_count: number;
    total_sessions: number;
    percentage: number;
  }>;
  semester_config: SemesterConfig | null;
}

interface EditTarget {
  attendanceId: string;
  studentId: string;
  sessionId: string;
  currentStatus: string;
  rect: DOMRect;
}

type Holiday = { date: string; name: string };

const STATUS_LABELS: Record<string, string> = {
  present: "Present ✓",
  late: "Late L",
  absent: "Absent —",
  gps_fail: "GPS ⚠",
};

export default function SummaryClient({ courseId }: { courseId: string }) {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState(80);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editStatus, setEditStatus] = useState<AttendanceStatus>("present");
  const [editNote, setEditNote] = useState("");
  const [editError, setEditError] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [tooltipSession, setTooltipSession] = useState<string | null>(null);
  const [hiddenSessions, setHiddenSessions] = useState<Set<string>>(new Set());
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/sheets/summary/${courseId}`)
      .then((r) => r.json())
      .then((d: SummaryData) => {
        setData(d);
        if (d.semester_config?.attendance_threshold) {
          setThreshold(d.semester_config.attendance_threshold);
        }
      })
      .finally(() => setLoading(false));

    fetch("/api/holidays")
      .then((r) => r.json())
      .then((d) => setHolidays(d.holidays ?? []))
      .catch(() => {});
  }, [courseId]);

  // Close popover on outside click
  useEffect(() => {
    if (!editTarget) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setEditTarget(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [editTarget]);

  const openEdit = (e: React.MouseEvent, studentId: string, sessionId: string) => {
    if (!data) return;
    const rec = data.attendance.find(
      (a) => a.student_id === studentId && a.session_id === sessionId
    );
    if (!rec) return;
    setEditTarget({
      attendanceId: rec.attendance_id,
      studentId,
      sessionId,
      currentStatus: rec.status,
      rect: (e.target as HTMLElement).getBoundingClientRect(),
    });
    setEditStatus(rec.status as AttendanceStatus);
    setEditNote("");
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    setEditSubmitting(true);
    setEditError("");
    try {
      const res = await fetch(`/api/sheets/attendance/${editTarget.attendanceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: editStatus, note: editNote }),
      });
      if (!res.ok) throw new Error();
      // Optimistically update grid + attendance records.
      // Stats (Att/Abs/Late/%) are derived from grid via visibleStats — no separate totals cache needed.
      setData((d) => {
        if (!d) return d;
        const newGrid = { ...d.grid };
        newGrid[editTarget.studentId] = { ...newGrid[editTarget.studentId], [editTarget.sessionId]: editStatus };
        const newAttendance = d.attendance.map((a) =>
          a.attendance_id === editTarget.attendanceId ? { ...a, status: editStatus } : a
        );
        return { ...d, grid: newGrid, attendance: newAttendance };
      });
      setEditTarget(null);
    } catch {
      setEditError("Save failed — please try again");
    } finally {
      setEditSubmitting(false);
    }
  };

  const exportCsv = () => {
    if (!data) return;
    const { course, sessions: rawSessions, students, grid, totals } = data;
    const exportSessions = [...rawSessions]
      .sort((a, b) => {
        if (a.week_label && b.week_label) return compareWeekLabels(a.week_label, b.week_label);
        if (a.week_label) return -1;
        if (b.week_label) return 1;
        return a.date.localeCompare(b.date);
      })
      .filter((ss) => !hiddenSessions.has(ss.session_id));
    const header = [
      "#", "Student ID", "First Name", "Last Name",
      ...exportSessions.map((s) => s.week_label ? `${s.week_label} ${s.date}` : `${s.date} P${s.period}`),
      "Att", "Abs", "Late", "%",
    ];
    const rows = students.map((s) => {
      const t = totals[s.student_id];
      const cells = exportSessions.map((sess) => {
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

  const { course, sessions: rawSessions, students, grid, totals, semester_config } = data;

  // Sort sessions by week label (W1m < W1t < … < W2m), fall back to date
  const sessions = [...rawSessions].sort((a, b) => {
    if (a.week_label && b.week_label) return compareWeekLabels(a.week_label, b.week_label);
    if (a.week_label) return -1;
    if (b.week_label) return 1;
    return a.date.localeCompare(b.date);
  });

  const visibleSessions = sessions.filter((ss) => !hiddenSessions.has(ss.session_id));
  const hiddenCount = hiddenSessions.size;
  const holidayDates = new Set(holidays.map((h) => h.date.slice(0, 10)));

  // Recompute per-student stats from grid using only visible sessions.
  // This ensures hiding a column immediately updates Att/Abs/Late/% columns.
  const visibleStats = (studentId: string) => {
    let present = 0, late = 0, absent = 0, gps_fail = 0;
    let wAttended = 0, wTotal = 0;
    for (const ss of visibleSessions) {
      const w = ss.period_count ?? 1;
      const st = grid[studentId]?.[ss.session_id];
      if (st === undefined) continue;
      wTotal += w;
      if (st === "present" || st === "overridden") { present++; wAttended += w; }
      else if (st === "late")     { late++;    wAttended += w; }
      else if (st === "absent")   { absent++; }
      else if (st === "gps_fail") { gps_fail++; }
    }
    const pct = wTotal > 0 ? Math.round((wAttended / wTotal) * 100) : 0;
    const hasAny = wTotal > 0;
    return { present, late, absent, gps_fail, pct, hasAny };
  };

  // Build set of linked session IDs (for visual grouping)
  const linkedIds = new Set<string>();
  for (const ss of sessions) {
    if (ss.linked_session_id) linkedIds.add(ss.linked_session_id);
  }

  // Flagged records set for ✓⚠ symbol
  const flaggedSet = new Set<string>(
    data.attendance.filter((a) => a.flagged).map((a) => `${a.student_id}:${a.session_id}`)
  );

  // Stats bar calculations
  const totalExpected = semester_config
    ? semester_config.total_weeks * semester_config.teaching_schedule.length
    : 0;
  const remaining = Math.max(0, totalExpected - sessions.length);
  const belowThreshold = students.filter((s) => {
    const vs = visibleStats(s.student_id);
    return vs.hasAny && vs.pct < threshold;
  }).length;

  // Session column summary (count of present+late per visible session)
  const sessionAttCounts = visibleSessions.map((ss) => {
    let count = 0;
    for (const s of students) {
      const st = grid[s.student_id]?.[ss.session_id];
      if (st === "present" || st === "late") count++;
    }
    return count;
  });

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
        <div className="flex flex-wrap items-center gap-2">
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
          {hiddenCount > 0 && (
            <button
              onClick={() => setHiddenSessions(new Set())}
              className="text-[12px] px-2.5 py-1.5 rounded-lg transition-colors hover:bg-gray-200"
              style={{ backgroundColor: "#F1EFE8", color: "#5F5E5A", border: "0.5px solid rgba(0,0,0,0.1)" }}
            >
              {hiddenCount} column{hiddenCount > 1 ? "s" : ""} hidden · Restore all
            </button>
          )}
          <button onClick={exportCsv} className="btn-outline text-[13px]" style={{ minHeight: 36 }}>
            <IconDownload size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {(totalExpected > 0 || belowThreshold > 0) && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg px-3 py-2.5 text-center" style={{ backgroundColor: "#E6F1FB" }}>
            <p className="text-[20px] font-bold" style={{ color: "#185FA5" }}>{sessions.length}</p>
            <p className="text-[11px]" style={{ color: "#185FA5" }}>Sessions Taught</p>
          </div>
          {totalExpected > 0 && (
            <div className="rounded-lg px-3 py-2.5 text-center" style={{ backgroundColor: remaining > 0 ? "#f3f4f6" : "#EAF3DE" }}>
              <p className="text-[20px] font-bold" style={{ color: remaining > 0 ? "#374151" : "#3B6D11" }}>{remaining}</p>
              <p className="text-[11px]" style={{ color: remaining > 0 ? "#5F5E5A" : "#3B6D11" }}>Remaining</p>
            </div>
          )}
          <div className="rounded-lg px-3 py-2.5 text-center" style={{ backgroundColor: belowThreshold > 0 ? "#FCEBEB" : "#EAF3DE" }}>
            <p className="text-[20px] font-bold" style={{ color: belowThreshold > 0 ? "#A32D2D" : "#3B6D11" }}>{belowThreshold}</p>
            <p className="text-[11px]" style={{ color: belowThreshold > 0 ? "#A32D2D" : "#3B6D11" }}>Below {threshold}%</p>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="overflow-x-auto rounded-xl relative" style={{ border: "0.5px solid rgba(0,0,0,0.1)" }}>
        <table className="min-w-full text-[13px] border-collapse bg-white">
          <thead>
            <tr style={{ borderBottom: "0.5px solid rgba(0,0,0,0.10)" }}>
              <th className="sticky left-0 z-10 bg-gray-50 text-left px-2 py-2.5 text-[11px] font-medium w-8" style={{ color: "#5F5E5A" }}>#</th>
              <th className="sticky left-8 z-10 bg-gray-50 text-left px-3 py-2.5 text-[11px] font-medium min-w-[7rem]" style={{ color: "#5F5E5A", boxShadow: "2px 0 4px rgba(0,0,0,0.05)" }}>
                Student
              </th>
              {visibleSessions.map((ss, ssIdx) => {
                const isHoliday = holidayDates.has(ss.date);
                const isPast = !!ss.is_past_session;
                const holiday = holidays.find((h) => h.date.slice(0, 10) === ss.date);
                const isLinkedRight = ss.linked_session_id && visibleSessions[ssIdx + 1]?.session_id === ss.linked_session_id;
                const isLinkedLeft = ss.linked_session_id && visibleSessions[ssIdx - 1]?.session_id === ss.linked_session_id;
                const isSingleDouble = (ss.period_count ?? 1) >= 2 && ss.check_in_mode !== "double";
                const isHovered = tooltipSession === ss.session_id;
                return (
                  <th key={ss.session_id}
                    className="px-2 py-2 text-[11px] font-medium text-center min-w-[3.5rem] relative cursor-pointer"
                    style={{
                      color: "#5F5E5A",
                      backgroundColor: isHoliday ? "#FEF9EC" : isLinkedRight || isLinkedLeft ? "rgba(24,95,165,0.04)" : undefined,
                      borderLeft: isLinkedLeft ? "2px solid #185FA5" : undefined,
                      borderRight: isLinkedRight ? "2px solid #185FA5" : undefined,
                    }}
                    onMouseEnter={() => setTooltipSession(ss.session_id)}
                    onMouseLeave={() => setTooltipSession(null)}
                  >
                    {/* Hide button — appears on hover */}
                    {isHovered && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setHiddenSessions((prev) => { const n = new Set(prev); n.add(ss.session_id); return n; });
                          setTooltipSession(null);
                        }}
                        className="absolute top-0.5 right-0.5 rounded flex items-center justify-center text-[10px] leading-none"
                        style={{ width: 14, height: 14, backgroundColor: "#fee2e2", color: "#A32D2D" }}
                        title="Hide column"
                      >
                        ×
                      </button>
                    )}
                    {ss.week_label ? (
                      <>
                        <div className="font-semibold" style={{ color: isHoliday ? "#854F0B" : "#185FA5" }}>
                          {ss.week_label}
                          {isSingleDouble && " ×2"}
                          {isHoliday && " 🎌"}
                          {isPast && " 📋"}
                        </div>
                        <div className="text-[10px] font-normal text-gray-400">{ss.date.slice(5)} P{ss.period}</div>
                      </>
                    ) : (
                      <>
                        <div>{ss.date.slice(5)}{isHoliday && " 🎌"}</div>
                        <div className="text-gray-400 font-normal">P{ss.period}</div>
                      </>
                    )}
                    {/* Tooltip */}
                    {isHovered && (
                      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-30 rounded-lg shadow-lg text-left p-2 min-w-[140px] text-[11px]"
                        style={{ backgroundColor: "#1e293b", color: "white", pointerEvents: "none" }}>
                        <p className="font-semibold">{ss.date}</p>
                        <p>Period {ss.period}{ss.period_end ? `–${ss.period_end}` : ""}</p>
                        {ss.week_label && <p>Week {ss.week_label}</p>}
                        {isSingleDouble && <p style={{ color: "#93C5FD" }}>Double period (×2)</p>}
                        {ss.check_in_mode === "double" && <p style={{ color: "#93C5FD" }}>Part {ss.part_number} of 2</p>}
                        {isPast && <p style={{ color: "#FBBF24" }}>📋 Past session</p>}
                        {holiday && <p style={{ color: "#FCA5A5" }}>🎌 {holiday.name}</p>}
                        <p className="mt-1 pt-1" style={{ borderTop: "0.5px solid rgba(255,255,255,0.2)", color: "#94a3b8" }}>Hover × to hide</p>
                      </div>
                    )}
                  </th>
                );
              })}
              <th className="px-2 py-2.5 text-[11px] font-medium text-center min-w-[2.5rem]" style={{ color: "#3B6D11" }}>Att.</th>
              <th className="px-2 py-2.5 text-[11px] font-medium text-center min-w-[2.5rem]" style={{ color: "#A32D2D" }}>Abs.</th>
              <th className="px-2 py-2.5 text-[11px] font-medium text-center min-w-[2.5rem]" style={{ color: "#185FA5" }}>Late</th>
              <th className="px-2 py-2.5 text-[11px] font-medium text-gray-700 text-center min-w-[3rem]">%</th>
            </tr>
          </thead>
          <tbody>
            {students.map((stu) => {
              const vs = visibleStats(stu.student_id);
              const low = vs.hasAny && vs.pct < threshold;
              const warn = vs.hasAny && vs.pct >= threshold - 10 && vs.pct < threshold;
              const rowBg = low && !warn ? "#FCEBEB" : warn ? "#FEF9EC" : "white";
              return (
                <tr key={stu.student_id} style={{ borderBottom: "0.5px solid rgba(0,0,0,0.06)", backgroundColor: rowBg }}>
                  <td className="sticky left-0 z-10 px-2 py-2 text-[11px] text-gray-400" style={{ backgroundColor: rowBg }}>{stu.order_num}</td>
                  <td className="sticky left-8 z-10 px-3 py-2 whitespace-nowrap text-[12px]" style={{ backgroundColor: rowBg, boxShadow: "2px 0 4px rgba(0,0,0,0.05)" }}>
                    <p className="font-medium text-gray-900">{stu.firstname} {stu.lastname}</p>
                    <p className="font-mono text-[10px]" style={{ color: "#5F5E5A" }}>{stu.student_id}</p>
                  </td>
                  {visibleSessions.map((ss) => {
                    const st = grid[stu.student_id]?.[ss.session_id] as AttendanceStatus | "overridden" | undefined;
                    const hasRecord = data.attendance.some(
                      (a) => a.student_id === stu.student_id && a.session_id === ss.session_id
                    );
                    return (
                      <td
                        key={ss.session_id}
                        className={`px-2 py-2 text-center transition-colors ${hasRecord ? "cursor-pointer hover:bg-gray-50" : ""}`}
                        onClick={(e) => hasRecord ? openEdit(e, stu.student_id, ss.session_id) : undefined}
                        title={hasRecord ? "Click to edit" : undefined}
                      >
                        {(() => {
                          const isFlagged = flaggedSet.has(`${stu.student_id}:${ss.session_id}`);
                          const flag = isFlagged ? <sup style={{ color: "#a855f7", fontSize: 8 }}>⚠</sup> : null;
                          if (st === "present")    return <span style={{ color: "#3B6D11" }} className="font-bold text-[13px]">✓{flag}</span>;
                          if (st === "late")       return <span style={{ color: "#185FA5" }} className="text-[11px] font-bold">L{flag}</span>;
                          if (st === "absent")     return <span style={{ color: "#A32D2D" }}>—{flag}</span>;
                          if (st === "gps_fail")   return <span className="text-[11px]" style={{ color: "#854F0B" }}>⚠{flag}</span>;
                          if (st === "overridden") return <span style={{ color: "#3B6D11" }} className="font-bold text-[13px]">✓*{flag}</span>;
                          return <span className="text-gray-200 text-[11px]">·</span>;
                        })()}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-center font-medium" style={{ color: "#3B6D11" }}>{vs.present + vs.late}</td>
                  <td className="px-2 py-2 text-center" style={{ color: "#A32D2D" }}>{vs.absent}</td>
                  <td className="px-2 py-2 text-center" style={{ color: "#185FA5" }}>{vs.late}</td>
                  <td className="px-2 py-2 text-center font-medium" style={{ color: low ? "#A32D2D" : warn ? "#854F0B" : "#374151" }}>
                    {vs.pct}%
                  </td>
                </tr>
              );
            })}
            {/* Summary row */}
            {visibleSessions.length > 0 && (
              <tr style={{ borderTop: "1px solid rgba(0,0,0,0.1)", backgroundColor: "#f9fafb" }}>
                <td className="sticky left-0 z-10 px-2 py-2 bg-gray-50" />
                <td className="sticky left-8 z-10 px-3 py-2 text-[11px] font-medium bg-gray-50" style={{ color: "#5F5E5A", boxShadow: "2px 0 4px rgba(0,0,0,0.05)" }}>
                  Total Attended
                </td>
                {visibleSessions.map((ss, i) => (
                  <td key={ss.session_id} className="px-2 py-2 text-center text-[11px] font-medium" style={{ color: "#185FA5" }}>
                    {sessionAttCounts[i]}
                  </td>
                ))}
                <td colSpan={4} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit popover */}
      {editTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.3)" }}>
          <div ref={popoverRef} className="card w-72 space-y-3 shadow-xl">
            <h3 className="font-medium text-gray-900 text-[14px]">Edit Attendance</h3>
            <p className="text-[12px]" style={{ color: "#5F5E5A" }}>
              Current: <span className="font-medium text-gray-800">{STATUS_LABELS[editTarget.currentStatus] ?? editTarget.currentStatus}</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(["present", "late", "absent", "gps_fail"] as AttendanceStatus[]).map((s) => {
                const active = editStatus === s;
                const colors: Record<AttendanceStatus, string> = {
                  present: "#3B6D11", late: "#185FA5", absent: "#A32D2D", gps_fail: "#854F0B",
                };
                return (
                  <button
                    key={s}
                    onClick={() => setEditStatus(s)}
                    className="rounded-lg px-3 py-2 text-[12px] font-medium capitalize transition-colors"
                    style={{
                      backgroundColor: active ? colors[s] : "#f3f4f6",
                      color: active ? "white" : "#374151",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                );
              })}
            </div>
            <div>
              <label className="block text-[12px] font-medium text-gray-700 mb-1">Note (optional)</label>
              <input
                className="input text-[13px]"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="Reason for change..."
              />
            </div>
            {editError && (
              <p className="text-[12px]" style={{ color: "#A32D2D" }}>{editError}</p>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditTarget(null)} className="btn-outline flex-1 text-[13px]" style={{ minHeight: 36 }}>
                Cancel
              </button>
              <button
                onClick={submitEdit}
                disabled={editSubmitting || editStatus === editTarget.currentStatus}
                className="btn-primary flex-1 text-[13px]"
                style={{ minHeight: 36 }}
              >
                {editSubmitting ? <Spinner className="h-4 w-4" /> : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
