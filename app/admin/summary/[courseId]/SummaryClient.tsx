"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import Spinner from "@/components/Spinner";
import { IconDownload } from "@/components/icons";
import { Course, Session, Student, AttendanceStatus, AttendanceRecord, SemesterConfig } from "@/types";
import { compareWeekLabels, expandWeekLabel } from "@/lib/week-utils";

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

export default function SummaryClient({ courseId, section }: { courseId: string; section?: string }) {
  const router = useRouter();
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
  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [sortByIssues, setSortByIssues] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  const loadSummary = useCallback((showSpinner = true) => {
    if (showSpinner) setLoading(true);
    return fetch(`/api/sheets/summary/${courseId}${section ? `?section=${encodeURIComponent(section)}` : ""}`)
      .then((r) => r.json())
      .then((d: SummaryData) => {
        setData(d);
        if (d.semester_config?.attendance_threshold) {
          setThreshold(d.semester_config.attendance_threshold);
        }

        // Holidays must cover the whole semester span, not just "next 7 days",
        // so past/future weeks in the grid can both show the 🎌 marker.
        const cfg = d.semester_config;
        const years = new Set<number>();
        if (cfg?.semester_start) {
          const start = new Date(cfg.semester_start);
          const end = new Date(start);
          end.setDate(end.getDate() + (cfg.total_weeks ?? 20) * 7);
          years.add(start.getFullYear());
          years.add(end.getFullYear());
        } else {
          years.add(new Date().getFullYear());
        }
        return fetch(`/api/holidays?years=${[...years].join(",")}`)
          .then((r) => r.json())
          .then((hd) => setHolidays(hd.holidays ?? []))
          .catch(() => {});
      })
      .finally(() => setLoading(false));
  }, [courseId, section]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const handleBulkGpsOff = async () => {
    setBulkSubmitting(true);
    setBulkError("");
    try {
      const res = await fetch("/api/sheets/sessions/bulk-gps-off", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_ids: [...selectedSessions] }),
      });
      if (!res.ok) throw new Error();
      await loadSummary(false);
      setShowBulkConfirm(false);
      setSelectMode(false);
      setSelectedSessions(new Set());
    } catch {
      setBulkError("บันทึกไม่สำเร็จ — กรุณาลองใหม่");
    } finally {
      setBulkSubmitting(false);
    }
  };

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

  const handleDeleteSession = async () => {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/sheets/sessions/${deleteTarget.session_id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      const sid = deleteTarget.session_id;
      setData((d) => {
        if (!d) return d;
        return {
          ...d,
          sessions: d.sessions.filter((s) => s.session_id !== sid),
          attendance: d.attendance.filter((a) => a.session_id !== sid),
          grid: Object.fromEntries(
            Object.entries(d.grid).map(([studentId, sessMap]) => [
              studentId,
              Object.fromEntries(Object.entries(sessMap).filter(([ssid]) => ssid !== sid)),
            ])
          ),
        };
      });
      setDeleteTarget(null);
    } catch {
      setDeleteError("ลบไม่สำเร็จ — กรุณาลองใหม่");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const exportXlsx = () => {
    if (!data) return;
    const { course, sessions: rawSessions, students, grid } = data;

    // Use the same visible-and-sorted sessions as the table
    const exportSessions = [...rawSessions]
      .sort((a, b) => {
        if (a.week_label && b.week_label) return compareWeekLabels(a.week_label, b.week_label);
        if (a.week_label) return -1;
        if (b.week_label) return 1;
        return a.date.localeCompare(b.date);
      })

    // Re-derive stats from visible sessions (same logic as visibleStats in render)
    const computeStats = (studentId: string) => {
      let att = 0, abs = 0, late = 0, wAttended = 0, wTotal = 0;
      for (const ss of exportSessions) {
        const w = ss.period_count ?? 1;
        const st = grid[studentId]?.[ss.session_id];
        if (st === undefined) continue;
        wTotal += w;
        if (st === "present" || st === "overridden") { att++; wAttended += w; }
        else if (st === "late") { late++; wAttended += w; }
        else if (st === "absent") { abs++; }
      }
      const pct = wTotal > 0 ? Math.round((wAttended / wTotal) * 100) : 0;
      return { att, abs, late, pct };
    };

    const sessionHeaders = exportSessions.map((s) =>
      s.week_label ? `${s.week_label}\n${s.date}` : `${s.date}\nP${s.period}`
    );
    const header = ["#", "รหัสนักศึกษา", "ชื่อ", "นามสกุล", ...sessionHeaders, "มา", "ขาด", "สาย", "%"];

    const rows = students.map((s) => {
      const stats = computeStats(s.student_id);
      const sessionCells = exportSessions.map((sess) => {
        const st = grid[s.student_id]?.[sess.session_id];
        if (st === "present" || st === "overridden") return 1;
        if (st === "late") return 0.5;
        if (st === "absent" || st === "gps_fail") return 0;
        return "";  // no record for this session
      });
      return [s.order_num, s.student_id, s.firstname, s.lastname, ...sessionCells,
        stats.att, stats.abs, stats.late, `${stats.pct}%`];
    });

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);

    // Column widths: fixed info cols + narrow session cols + summary cols
    ws["!cols"] = [
      { wch: 5 },
      { wch: 14 },
      { wch: 18 },
      { wch: 18 },
      ...exportSessions.map(() => ({ wch: 8 })),
      { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 7 },
    ];

    // Row height for the header (two-line week label)
    ws["!rows"] = [{ hpt: 30 }];

    const wb = XLSX.utils.book_new();
    const sheetName = `${course.course_id} Sec${course.section}`.replace(/[:\\/?*[\]]/g, "-");
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31)); // Excel sheet name limit
    const fileSafeId = `${course.course_id}_sec${course.section}`.replace(/[:\\/?*[\]]/g, "-");
    XLSX.writeFile(wb, `attendance_${fileSafeId}.xlsx`);
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

  const visibleSessions = sessions;
  const holidayDates = new Set(holidays.map((h) => h.date.slice(0, 10)));

  // Recompute per-student stats from grid using only visible sessions.
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

  // --- Sort-by-issues logic ---
  // Build conflict groups: (device_fingerprint + session_id) → Set<student_id> (only when ≥2 students share one device)
  type ConflictGroup = { key: string; studentIds: string[] };
  const conflictGroups: ConflictGroup[] = (() => {
    const fpMap = new Map<string, Set<string>>();
    for (const rec of data.attendance) {
      if (rec.flagged && rec.device_fingerprint) {
        const key = `${rec.device_fingerprint}:${rec.session_id}`;
        if (!fpMap.has(key)) fpMap.set(key, new Set());
        fpMap.get(key)!.add(rec.student_id);
      }
    }
    const groups: ConflictGroup[] = [];
    for (const [key, sids] of fpMap) {
      if (sids.size >= 2) groups.push({ key, studentIds: [...sids] });
    }
    return groups;
  })();

  // student_id → conflict group key (first group only)
  const studentConflictGroup = new Map<string, string>();
  const conflictStudentIds = new Set<string>();
  for (const g of conflictGroups) {
    for (const sid of g.studentIds) {
      conflictStudentIds.add(sid);
      if (!studentConflictGroup.has(sid)) studentConflictGroup.set(sid, g.key);
    }
  }

  // Sorted student list based on mode
  type RowEntry = { student: Student; category: "conflict" | "absent" | "normal"; groupKey?: string; isGroupLast?: boolean };
  const sortedRows: RowEntry[] = (() => {
    if (!sortByIssues) {
      return students.map((s) => ({ student: s, category: "normal" as const }));
    }

    // 1. Conflict group rows (students grouped by conflict key, pairs adjacent)
    const seenConflict = new Set<string>();
    const conflictRows: RowEntry[] = [];
    for (const g of conflictGroups) {
      const groupStudents = g.studentIds
        .map((sid) => students.find((s) => s.student_id === sid))
        .filter(Boolean) as Student[];
      groupStudents.forEach((s, i) => {
        if (seenConflict.has(s.student_id)) return;
        seenConflict.add(s.student_id);
        conflictRows.push({
          student: s,
          category: "conflict",
          groupKey: g.key,
          isGroupLast: i === groupStudents.length - 1,
        });
      });
    }

    // 2. Absent rows (not already in conflict group), sorted by absent count desc
    const absentRows: RowEntry[] = students
      .filter((s) => !conflictStudentIds.has(s.student_id))
      .map((s) => ({ student: s, absentCount: visibleStats(s.student_id).absent }))
      .filter(({ absentCount }) => absentCount > 0)
      .sort((a, b) => b.absentCount - a.absentCount)
      .map(({ student }) => ({ student, category: "absent" as const }));

    // 3. Normal rows
    const absentIds = new Set(absentRows.map((r) => r.student.student_id));
    const normalRows: RowEntry[] = students
      .filter((s) => !conflictStudentIds.has(s.student_id) && !absentIds.has(s.student_id))
      .map((s) => ({ student: s, category: "normal" as const }));

    return [...conflictRows, ...absentRows, ...normalRows];
  })();

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

  const selectedGpsFailCount = data.attendance.filter(
    (a) => selectedSessions.has(a.session_id) && a.status === "gps_fail"
  ).length;

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
          <button
            type="button"
            onClick={() => setSortByIssues((v) => !v)}
            className="text-[13px] px-3 py-1.5 rounded-xl font-medium transition-colors"
            style={{
              minHeight: 36,
              backgroundColor: sortByIssues ? "#F3E8FF" : "#F1EFE8",
              color: sortByIssues ? "#7C3AED" : "#5F5E5A",
              border: sortByIssues ? "0.5px solid #C4B5FD" : "0.5px solid rgba(0,0,0,0.1)",
            }}
          >
            {sortByIssues ? "⚠ เรียงตามปัญหา" : "⚠ เรียงตามปัญหา"}
          </button>
          <button
            type="button"
            onClick={() => { setSelectMode((v) => !v); setSelectedSessions(new Set()); }}
            className="text-[13px] px-3 py-1.5 rounded-xl font-medium transition-colors"
            style={{
              minHeight: 36,
              backgroundColor: selectMode ? "#DBEAFE" : "#F1EFE8",
              color: selectMode ? "#185FA5" : "#5F5E5A",
              border: selectMode ? "0.5px solid #93C5FD" : "0.5px solid rgba(0,0,0,0.1)",
            }}
          >
            {selectMode ? "🌐 ยกเลิกเลือก" : "🌐 ปิด GPS ย้อนหลัง"}
          </button>
          <button onClick={exportXlsx} className="btn-outline text-[13px]" style={{ minHeight: 36 }}>
            <IconDownload size={14} /> Export .xlsx
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

      {/* Bulk GPS-off action bar */}
      {selectMode && (
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg" style={{ backgroundColor: "#E6F1FB", border: "0.5px solid #93C5FD" }}>
          <span className="text-[13px]" style={{ color: "#185FA5" }}>
            {selectedSessions.size > 0
              ? `เลือก ${selectedSessions.size} session`
              : "คลิกเลือก session ที่สอนออนไลน์ (คลิกที่หัวคอลัมน์)"}
          </span>
          {selectedSessions.size > 0 && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setSelectedSessions(new Set())}
                className="text-[13px] text-gray-500 underline" style={{ background: "none", border: "none", cursor: "pointer" }}>
                ล้างการเลือก
              </button>
              <button type="button" onClick={() => setShowBulkConfirm(true)}
                className="btn-primary text-[13px]" style={{ minHeight: 32, padding: "6px 14px" }}>
                🌐 ปิด GPS ย้อนหลัง
              </button>
            </div>
          )}
        </div>
      )}

      {/* Grid */}
      <div className="overflow-auto rounded-xl relative" style={{ border: "0.5px solid rgba(0,0,0,0.1)", maxHeight: "calc(100vh - 240px)" }}>
        <table className="min-w-full text-[13px] border-collapse bg-white">
          <thead>
            <tr style={{ borderBottom: "0.5px solid rgba(0,0,0,0.10)" }}>
              <th className="sticky left-0 top-0 z-20 bg-gray-50 text-left px-2 py-2.5 text-[11px] font-medium w-8" style={{ color: "#5F5E5A" }}>#</th>
              <th className="sticky left-8 top-0 z-20 bg-gray-50 text-left px-3 py-2.5 text-[11px] font-medium min-w-[8rem]" style={{ color: "#5F5E5A", boxShadow: "3px 0 6px rgba(0,0,0,0.08)" }}>
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
                const isSelected = selectedSessions.has(ss.session_id);
                const isOnline = ss.gps_enabled === false;
                return (
                  <th key={ss.session_id}
                    className="sticky top-0 z-10 px-2 py-2 text-[11px] font-medium text-center min-w-[3.5rem] relative cursor-pointer"
                    style={{
                      color: "#5F5E5A",
                      backgroundColor: selectMode && isSelected ? "#DBEAFE" : isHoliday ? "#FEF9EC" : isLinkedRight || isLinkedLeft ? "rgba(24,95,165,0.04)" : "white",
                      borderLeft: isLinkedLeft ? "2px solid #185FA5" : undefined,
                      borderRight: isLinkedRight ? "2px solid #185FA5" : undefined,
                    }}
                    onMouseEnter={() => setTooltipSession(ss.session_id)}
                    onMouseLeave={() => setTooltipSession(null)}
                    onClick={() => {
                      if (selectMode) {
                        setSelectedSessions((prev) => {
                          const next = new Set(prev);
                          if (next.has(ss.session_id)) next.delete(ss.session_id); else next.add(ss.session_id);
                          return next;
                        });
                        return;
                      }
                      // Touch devices have no hover: first tap reveals the tooltip
                      // + delete button, second tap navigates.
                      const touchOnly = typeof window !== "undefined" && window.matchMedia("(hover: none)").matches;
                      if (touchOnly && tooltipSession !== ss.session_id) {
                        setTooltipSession(ss.session_id);
                        return;
                      }
                      router.push(`/admin/session/${ss.session_id}`);
                    }}
                  >
                    {/* Selection checkbox — select mode only */}
                    {selectMode && (
                      <span
                        className="absolute top-0.5 left-0.5 rounded flex items-center justify-center text-[10px] leading-none"
                        style={{
                          width: 16, height: 16,
                          border: `1.5px solid ${isSelected ? "#185FA5" : "#d1d5db"}`,
                          backgroundColor: isSelected ? "#185FA5" : "white",
                          color: "white",
                        }}
                      >
                        {isSelected ? "✓" : ""}
                      </span>
                    )}
                    {/* Delete button — appears on hover, hidden while selecting */}
                    {isHovered && !selectMode && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTooltipSession(null);
                          setDeleteError("");
                          setDeleteTarget(ss);
                        }}
                        className="absolute top-0.5 right-0.5 rounded flex items-center justify-center text-[12px] leading-none"
                        style={{ width: 22, height: 22, backgroundColor: "#fee2e2", color: "#A32D2D" }}
                        title="Delete session"
                      >
                        ×
                      </button>
                    )}
                    {ss.week_label ? (
                      <>
                        <div className="font-semibold" style={{ color: isHoliday ? "#854F0B" : "#185FA5" }} title={expandWeekLabel(ss.week_label)}>
                          {ss.week_label}
                          {isSingleDouble && " ×2"}
                          {isHoliday && " 🎌"}
                          {isPast && " 📋"}
                          {isOnline && " 🌐"}
                        </div>
                        <div className="text-[10px] font-normal text-gray-400">{ss.date.slice(5)} P{ss.period}</div>
                      </>
                    ) : (
                      <>
                        <div>{ss.date.slice(5)}{isHoliday && " 🎌"}{isOnline && " 🌐"}</div>
                        <div className="text-gray-400 font-normal">P{ss.period}</div>
                      </>
                    )}
                    {/* Tooltip */}
                    {isHovered && (
                      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-30 rounded-lg shadow-lg text-left p-2 min-w-[140px] text-[11px]"
                        style={{ backgroundColor: "#1e293b", color: "white", pointerEvents: "none" }}>
                        <p className="font-semibold">{ss.date}</p>
                        <p>Period {ss.period}{ss.period_end ? `–${ss.period_end}` : ""}</p>
                        {ss.week_label && <p>{expandWeekLabel(ss.week_label)}</p>}
                        {isSingleDouble && <p style={{ color: "#93C5FD" }}>Double period (×2)</p>}
                        {ss.check_in_mode === "double" && <p style={{ color: "#93C5FD" }}>Part {ss.part_number} of 2</p>}
                        {isPast && <p style={{ color: "#FBBF24" }}>📋 Past session</p>}
                        {holiday && <p style={{ color: "#FCA5A5" }}>🎌 {holiday.name}</p>}
                        {isOnline && <p style={{ color: "#93C5FD" }}>🌐 Online (GPS off)</p>}
                        <p className="mt-1 pt-1" style={{ borderTop: "0.5px solid rgba(255,255,255,0.2)", color: "#94a3b8" }}>
                          {selectMode ? "คลิกเพื่อเลือก session นี้" : "คลิกเพื่อเปิดหน้า session · × เพื่อลบถาวร"}
                        </p>
                      </div>
                    )}
                  </th>
                );
              })}
              <th className="sticky top-0 z-10 bg-gray-50 px-2 py-2.5 text-[11px] font-medium text-center min-w-[2.5rem]" style={{ color: "#3B6D11" }}>Att.</th>
              <th className="sticky top-0 z-10 bg-gray-50 px-2 py-2.5 text-[11px] font-medium text-center min-w-[2.5rem]" style={{ color: "#A32D2D" }}>Abs.</th>
              <th className="sticky top-0 z-10 bg-gray-50 px-2 py-2.5 text-[11px] font-medium text-center min-w-[2.5rem]" style={{ color: "#185FA5" }}>Late</th>
              <th className="sticky top-0 z-10 bg-gray-50 px-2 py-2.5 text-[11px] font-medium text-gray-700 text-center min-w-[3rem]">%</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, rowIdx) => {
              const stu = row.student;
              const vs = visibleStats(stu.student_id);
              const low = vs.hasAny && vs.pct < threshold;
              const warn = vs.hasAny && vs.pct >= threshold - 10 && vs.pct < threshold;
              const isConflict = row.category === "conflict";
              const isAbsent = row.category === "absent" && sortByIssues;

              // Base row background (conflict overrides threshold highlight)
              const rowBg = isConflict ? "#FAF5FF" : low && !warn ? "#FCEBEB" : warn ? "#FEF9EC" : "white";
              const leftBorder = isConflict ? "3px solid #a855f7" : isAbsent ? "3px solid #A32D2D" : undefined;

              // Separator before first absent row and first normal row (in issue-sort mode)
              const prevRow = sortedRows[rowIdx - 1];
              const needSeparator = sortByIssues && prevRow && prevRow.category !== row.category;

              return (
                <>
                  {needSeparator && (
                    <tr key={`sep-${rowIdx}`} aria-hidden>
                      <td colSpan={visibleSessions.length + 6}
                        style={{ padding: 0, height: 2, backgroundColor: row.category === "absent" ? "#FCEBEB" : "#f3f4f6" }} />
                    </tr>
                  )}
                  {/* Conflict sub-group separator (between different device groups) */}
                  {isConflict && prevRow?.category === "conflict" && prevRow.groupKey !== row.groupKey && (
                    <tr key={`cg-sep-${rowIdx}`} aria-hidden>
                      <td colSpan={visibleSessions.length + 6}
                        style={{ padding: 0, height: 1, backgroundColor: "#E9D5FF" }} />
                    </tr>
                  )}
                <tr key={stu.student_id} style={{ borderBottom: "0.5px solid rgba(0,0,0,0.06)", backgroundColor: rowBg }}>
                  <td className="sticky left-0 z-10 px-2 py-2 text-[11px] text-gray-400" style={{ backgroundColor: rowBg, borderLeft: leftBorder }}>{stu.order_num}</td>
                  <td className="sticky left-8 z-10 px-3 py-2 whitespace-nowrap text-[12px]" style={{ backgroundColor: rowBg, boxShadow: "3px 0 6px rgba(0,0,0,0.08)" }}>
                    <p className="font-medium text-gray-900">
                      {isConflict && <span className="mr-1 text-[10px]" style={{ color: "#a855f7" }}>⚠</span>}
                      {stu.firstname} {stu.lastname}
                    </p>
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
                </>
              );
            })}
            {/* Summary row */}
            {visibleSessions.length > 0 && (
              <tr style={{ borderTop: "1px solid rgba(0,0,0,0.1)", backgroundColor: "#f9fafb" }}>
                <td className="sticky left-0 z-10 px-2 py-2 bg-gray-50" />
                <td className="sticky left-8 z-10 px-3 py-2 text-[11px] font-medium bg-gray-50" style={{ color: "#5F5E5A", boxShadow: "3px 0 6px rgba(0,0,0,0.08)" }}>
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

      {/* Delete session confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <div>
              <p className="text-[15px] font-semibold" style={{ color: "#A32D2D" }}>ลบ Session นี้?</p>
              <p className="text-[13px] mt-1" style={{ color: "#374151" }}>
                {deleteTarget.week_label ? `${deleteTarget.week_label} — ` : ""}{deleteTarget.date}
                {deleteTarget.period ? ` · P${deleteTarget.period}` : ""}
              </p>
              <p className="text-[12px] mt-2" style={{ color: "#5F5E5A" }}>
                ข้อมูลการเช็คชื่อของนักศึกษาทุกคนในคาบนี้จะถูกลบออกอย่างถาวร ไม่สามารถกู้คืนได้
              </p>
            </div>
            {deleteError && (
              <p className="text-[12px]" style={{ color: "#A32D2D" }}>{deleteError}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setDeleteTarget(null); setDeleteError(""); }}
                disabled={deleteSubmitting}
                className="btn-outline flex-1 text-[13px]"
                style={{ minHeight: 36 }}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleDeleteSession}
                disabled={deleteSubmitting}
                className="flex-1 text-[13px] rounded-xl font-medium text-white transition-colors"
                style={{ minHeight: 36, backgroundColor: "#A32D2D" }}
              >
                {deleteSubmitting ? <Spinner className="h-4 w-4 mx-auto" /> : "ลบถาวร"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk GPS-off confirmation modal */}
      {showBulkConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <div>
              <p className="text-[15px] font-semibold text-gray-900">ปิด GPS ย้อนหลัง?</p>
              <p className="text-[13px] mt-2" style={{ color: "#374151" }}>
                {selectedSessions.size} session ที่เลือกจะถูกตั้งเป็น &quot;สอนออนไลน์&quot; (ปิดการตรวจ GPS ถาวร)
                {selectedGpsFailCount > 0 && (
                  <> และนักศึกษาที่มีสถานะ <strong>GPS Fail {selectedGpsFailCount} คน</strong> จะถูกเปลี่ยนเป็น Present ทันที</>
                )}
              </p>
            </div>
            {bulkError && (
              <p className="text-[12px]" style={{ color: "#A32D2D" }}>{bulkError}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowBulkConfirm(false); setBulkError(""); }}
                disabled={bulkSubmitting}
                className="btn-outline flex-1 text-[13px]"
                style={{ minHeight: 36 }}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleBulkGpsOff}
                disabled={bulkSubmitting}
                className="flex-1 text-[13px] rounded-xl font-medium text-white transition-colors"
                style={{ minHeight: 36, backgroundColor: "#185FA5" }}
              >
                {bulkSubmitting ? <Spinner className="h-4 w-4 mx-auto" /> : "ยืนยัน"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
