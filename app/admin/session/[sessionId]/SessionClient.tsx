"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import Spinner from "@/components/Spinner";
import Slider from "@/components/Slider";
import Toggle from "@/components/Toggle";
import IssueBadge, { IssueType } from "@/components/IssueBadge";
import ActionButtons, { ActionType } from "@/components/ActionButtons";
import UndoToast from "@/components/UndoToast";
import {
  IconScreen, IconStop, IconDownload, IconWarning,
  IconChevronDown, IconChevronUp, IconQR,
} from "@/components/icons";
import { Session, StudentWithAttendance, DeviceConflict, AttendanceStatus, AttendanceRecord } from "@/types";
import { getPeriodLabel } from "@/lib/period-utils";
import { useClock } from "@/lib/hooks/useClock";

interface Data {
  session: Session;
  students: StudentWithAttendance[];
  spreadsheetId: string;
  device_conflicts: DeviceConflict[];
  linked_session?: Session | null;
  part1_attendance?: AttendanceRecord[] | null;
}

type EditPopover = {
  attendanceId: string;
  studentId: string;
  studentName: string;
  currentStatus: AttendanceStatus;
};

type UndoState = {
  attendanceId: string;
  studentName: string;
  previousStatus: string;
};

type RowMenuState = {
  studentId: string;
  top: number;
  left: number;
  openUpward: boolean;
  onEdit: () => void;
  onFlag?: () => void;
  onRevoke?: () => void;
  onDelete: () => void;
};

const BORDER_COLORS: Record<IssueType, string> = {
  gps_fail: "#ef4444",
  device_conflict: "#f97316",
  late: "#eab308",
  manual: "#3b82f6",
  flagged: "#a855f7",
};

// Short labels auto-attached when approving — so the row keeps a record of
// *what* was overridden without the teacher typing anything.
const ISSUE_LABELS: Record<IssueType, string> = {
  gps_fail: "GPS Fail",
  device_conflict: "Same Device",
  late: "Late",
  manual: "Manual",
  flagged: "Flagged",
};

const ISSUE_FILTER_LABELS: Partial<Record<IssueType, string>> = {
  gps_fail: "GPS Fail",
  device_conflict: "Same Device",
  late: "Late",
  flagged: "Flagged",
};

function IssueChip({ active, color, onClick, children }: {
  active: boolean; color: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-medium rounded-full px-2.5 py-1 transition-colors"
      style={{
        color: active ? "#fff" : color,
        backgroundColor: active ? color : "transparent",
        border: `1px solid ${color}`,
      }}
    >
      {children}
    </button>
  );
}

function getIssues(stu: StudentWithAttendance, conflictSet: Set<string>): IssueType[] {
  const att = stu.attendance;
  if (!att) return [];
  const issues: IssueType[] = [];
  if (att.status === "gps_fail") issues.push("gps_fail");
  if (conflictSet.has(stu.student_id)) issues.push("device_conflict");
  if (att.status === "late") issues.push("late");
  if (att.is_manual_entry) issues.push("manual");
  if (att.flagged) issues.push("flagged");
  return issues;
}

export default function SessionClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const clock  = useClock();

  const [data, setData]             = useState<Data | null>(null);
  const [loading, setLoading]       = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showClose, setShowClose]   = useState(false);
  const [closing, setClosing]       = useState(false);
  const [closeError, setCloseError] = useState("");
  const [actioning, setActioning]   = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [editError, setEditError]   = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [undoToast, setUndoToast]   = useState<UndoState | null>(null);
  const [conflictDismissed, setConflictDismissed] = useState(false);
  const [conflictsExpanded, setConflictsExpanded] = useState(false);
  const [possibleDismissed, setPossibleDismissed] = useState(false);
  const [possibleExpanded, setPossibleExpanded] = useState(false);
  const [issueFilter, setIssueFilter] = useState<IssueType | null>(null);
  const [showManualQR, setShowManualQR] = useState(false);
  const [manualQrDataUrl, setManualQrDataUrl] = useState("");

  // Edit attendance
  const [editPopover, setEditPopover] = useState<EditPopover | null>(null);
  const [editStatus, setEditStatus]   = useState<AttendanceStatus>("present");
  const [editNote, setEditNote]       = useState("");
  const [editSaving, setEditSaving]   = useState(false);
  const editRef = useRef<HTMLDivElement>(null);

  // Delete attendance
  const [deleteAttId, setDeleteAttId] = useState<string | null>(null);
  const [deletingAtt, setDeletingAtt] = useState(false);

  // Row ⋯ menu (portal)
  const [rowMenu, setRowMenu]   = useState<RowMenuState | null>(null);
  const rowMenuRef = useRef<HTMLDivElement>(null);

  // Add manual record
  const [showManual, setShowManual]   = useState(false);
  const [manualForm, setManualForm]   = useState({ student_id: "", status: "present" as AttendanceStatus, note: "" });
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError]   = useState("");

  // OTP countdown + auto-close
  const [otpSecondsLeft, setOtpSecondsLeft] = useState<number | null>(null);
  const autoClosedRef = useRef(false);
  const dataRef = useRef<Data | null>(null);
  dataRef.current = data;

  // Reopen / Activate Part 2
  const [reopening, setReopening]         = useState(false);
  const [activatingPart2, setActivatingPart2] = useState(false);
  const [showReopenSettings, setShowReopenSettings] = useState(false);
  const [reopenForm, setReopenForm] = useState({ radius_m: 200, late_after_min: 15, otp_expire_min: 15, late_enabled: true });

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/sheets/session/${sessionId}`);
      if (!res.ok) return;
      const d: Data = await res.json();
      setData(d);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 5000);
    return () => clearInterval(t);
  }, [fetchData]);

  // Restore conflict banner dismiss state from sessionStorage
  useEffect(() => {
    setConflictDismissed(sessionStorage.getItem(`conflict_dismissed_${sessionId}`) === "1");
    setPossibleDismissed(sessionStorage.getItem(`conflict_possible_dismissed_${sessionId}`) === "1");
  }, [sessionId]);

  // OTP countdown — auto-closes session when timer hits zero
  const openedAt   = data?.session.opened_at;
  const expireMin  = data?.session.otp_expire_min;
  const sessionClosed = !!data?.session.closed_at;

  useEffect(() => {
    if (!openedAt || !expireMin || sessionClosed) {
      setOtpSecondsLeft(null);
      return;
    }
    const expireAt = new Date(openedAt).getTime() + expireMin * 60 * 1000;
    autoClosedRef.current = false;

    const tick = () => {
      const remaining = Math.floor((expireAt - Date.now()) / 1000);
      setOtpSecondsLeft(Math.max(0, remaining));
      if (remaining <= 0 && !autoClosedRef.current) {
        autoClosedRef.current = true;
        const d = dataRef.current;
        if (!d || d.session.closed_at) return;
        // Auto-close without redirecting so teacher sees Re-Generate option
        fetch("/api/sheets/sessions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: d.session.session_id,
            course_id: d.session.course_id,
            section: d.session.section,
          }),
        }).then(() => fetchData()).catch(() => {});
      }
    };

    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [openedAt, expireMin, sessionClosed, fetchData]);

  // Close edit popover on outside click
  useEffect(() => {
    if (!editPopover) return;
    const handler = (e: MouseEvent) => {
      if (editRef.current && !editRef.current.contains(e.target as Node)) setEditPopover(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [editPopover]);

  // Close row menu on outside click or scroll
  useEffect(() => {
    if (!rowMenu) return;
    const handleScroll = () => setRowMenu(null);
    const handleMouseDown = (e: MouseEvent) => {
      if (rowMenuRef.current && !rowMenuRef.current.contains(e.target as Node)) setRowMenu(null);
    };
    window.addEventListener("scroll", handleScroll, true);
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [rowMenu]);

  const openRowMenu = (e: React.MouseEvent<HTMLButtonElement>, stu: StudentWithAttendance) => {
    const att = stu.attendance!;
    if (rowMenu?.studentId === stu.student_id) { setRowMenu(null); return; }
    const studentName = `${stu.firstname} ${stu.lastname}`;
    const itemCount = 2 + (!att.flagged ? 1 : 0) + (att.overridden ? 1 : 0); // Edit Status + Delete + optional Flag/Revoke
    const rect     = e.currentTarget.getBoundingClientRect();
    const menuH    = itemCount * 38 + 8;
    const menuW    = 160;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpward = spaceBelow < menuH && (spaceAbove >= menuH || spaceAbove > spaceBelow);
    const alignRight = rect.right + menuW > window.innerWidth;
    setRowMenu({
      studentId: stu.student_id,
      top:  openUpward ? rect.top - menuH - 4 : rect.bottom + 4,
      left: alignRight ? rect.right - menuW   : rect.left,
      openUpward,
      onEdit:   () => { openEditPopover(stu); setRowMenu(null); },
      onFlag:   !att.flagged    ? () => { handleAction(att.attendance_id, "flag", studentName); setRowMenu(null); } : undefined,
      onRevoke: att.overridden  ? () => { handleAction(att.attendance_id, "revoke", studentName); setRowMenu(null); } : undefined,
      onDelete: () => { setDeleteAttId(att.attendance_id); setRowMenu(null); },
    });
  };

  const handleClose = async () => {
    if (!data) return;
    setClosing(true);
    setCloseError("");
    try {
      const res = await fetch("/api/sheets/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, course_id: data.session.course_id, section: data.session.section }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setCloseError(d.error ?? "Failed to close session");
        return;
      }
      router.push("/admin");
    } finally {
      setClosing(false);
    }
  };

  const openReopenSettings = () => {
    if (data) {
      setReopenForm({
        radius_m: data.session.radius_m,
        late_after_min: data.session.late_after_min,
        otp_expire_min: data.session.otp_expire_min,
        late_enabled: data.session.late_enabled !== false,
      });
    }
    setShowReopenSettings(true);
  };

  const handleReopen = async () => {
    setReopening(true);
    try {
      await fetch(`/api/sheets/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reopen: true, ...reopenForm }),
      });
      await fetchData();
      setShowReopenSettings(false);
    } finally {
      setReopening(false);
    }
  };

  const handleActivatePart2 = async (linkedSessionId: string) => {
    setActivatingPart2(true);
    try {
      const res = await fetch(`/api/sheets/sessions/${linkedSessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activate: true }),
      });
      if (!res.ok) { setActionError("Failed to open Part 2"); return; }
      await fetchData();
    } finally {
      setActivatingPart2(false);
    }
  };

  const handleAction = async (attendanceId: string, action: ActionType, studentName: string, note?: string) => {
    setActioning(attendanceId);
    try {
      const res = await fetch(`/api/sheets/attendance/${attendanceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(note ? { note } : {}) }),
      });
      const d = await res.json();
      if (!res.ok) { setActionError("Action failed"); return; }
      if (action === "mark_absent") {
        setUndoToast({ attendanceId, studentName, previousStatus: d.previousStatus ?? "present" });
      }
      await fetchData();
    } finally {
      setActioning(null);
    }
  };

  const handleUndo = async () => {
    if (!undoToast) return;
    await fetch(`/api/sheets/attendance/${undoToast.attendanceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: undoToast.previousStatus, edit_note: "Undo mark absent" }),
    });
    await fetchData();
  };

  const openManualQR = async () => {
    setShowManualQR(true);
    if (!manualQrDataUrl) {
      const url     = window.location.origin + "/check";
      const dataUrl = await QRCode.toDataURL(url, { width: 500, margin: 2 });
      setManualQrDataUrl(dataUrl);
    }
  };

  const downloadManualQR = () => {
    if (!manualQrDataUrl) return;
    const a = document.createElement("a");
    a.href     = manualQrDataUrl;
    a.download = "attendance-qr-manual.png";
    a.click();
  };

  const copyCheckUrl = () => { navigator.clipboard.writeText(window.location.origin + "/check"); };

  const openEditPopover = (stu: StudentWithAttendance) => {
    if (!stu.attendance) return;
    setEditPopover({
      attendanceId: stu.attendance.attendance_id,
      studentId:    stu.student_id,
      studentName:  `${stu.firstname} ${stu.lastname}`,
      currentStatus: stu.attendance.status,
    });
    setEditStatus(stu.attendance.status);
    setEditNote("");
  };

  const submitEdit = async () => {
    if (!editPopover) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/sheets/attendance/${editPopover.attendanceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: editStatus, edit_note: editNote }),
      });
      if (!res.ok) { setEditError("Edit failed"); return; }
      await fetchData();
      setEditPopover(null);
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteAtt = async () => {
    if (!deleteAttId) return;
    setDeletingAtt(true);
    try {
      const res = await fetch(`/api/sheets/attendance/${deleteAttId}`, { method: "DELETE" });
      if (!res.ok) { setDeleteError("Delete failed"); return; }
      await fetchData();
      setDeleteAttId(null);
    } finally {
      setDeletingAtt(false);
    }
  };

  const handleAddManual = async () => {
    if (!data) return;
    setManualError("");
    if (!manualForm.student_id.trim()) { setManualError("Select a student"); return; }
    setManualSaving(true);
    try {
      const res = await fetch("/api/sheets/attendance/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          course_id:  data.session.course_id,
          section:    data.session.section,
          student_id: manualForm.student_id,
          status:     manualForm.status,
          note:       manualForm.note,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setManualError(d.error ?? "Error"); return; }
      await fetchData();
      setShowManual(false);
      setManualForm({ student_id: "", status: "present", note: "" });
    } finally {
      setManualSaving(false);
    }
  };

  const exportCsv = () => {
    if (!data) return;
    const rows = [
      ["#", "Student ID", "First Name", "Last Name", "Status", "Distance (m)", "Time", "device_fingerprint"],
      ...data.students.map((s) => [
        s.order_num, s.student_id, s.firstname, s.lastname,
        s.attendance?.status ?? "absent",
        s.attendance?.distance_m ?? "",
        s.attendance?.checked_at ? new Date(s.attendance.checked_at).toLocaleTimeString("th-TH") : "",
        s.attendance?.device_fingerprint ?? "",
      ]),
    ];
    const csv = "﻿" + rows.map((r) => r.join(",")).join("\n");
    const a   = document.createElement("a");
    a.href     = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `session_${sessionId}.csv`;
    a.click();
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <Spinner className="h-8 w-8 text-[#185FA5]" />
    </div>
  );
  if (!data) return (
    <div className="card text-center py-10" style={{ color: "#A32D2D" }}>Session not found</div>
  );

  const { session: s, students, spreadsheetId, device_conflicts, linked_session, part1_attendance } = data;
  const isClosed = !!s.closed_at;
  const isToday  = s.date === new Date().toISOString().split("T")[0];

  // Device conflicts: "confirmed" = same fingerprint/GPU hash, "possible" = same IP
  // + close time/GPS only (heuristic — shown separately since it can false-positive
  // on shared campus WiFi). Row badges/borders only reflect confirmed matches.
  const confirmedConflicts = device_conflicts.filter((c) => c.tier === "confirmed");
  const possibleConflicts  = device_conflicts.filter((c) => c.tier === "possible");
  const conflictSet = new Set<string>(
    confirmedConflicts.flatMap((c) => c.students.map((st) => st.student_id))
  );

  // Double period helpers
  const isDoubleCheckIn = s.check_in_mode === "double";
  const periodLabel = s.period_count && s.period_count >= 2
    ? getPeriodLabel(parseInt(s.period), s.period_end)
    : `Period ${s.period}`;
  const partBadge = s.part_number === 1 ? "①" : s.part_number === 2 ? "②" : "";

  // Part 1 attendance map (Part 2 comparison panel)
  const part1Map = part1_attendance
    ? new Map(part1_attendance.map((a) => [a.student_id, a.status]))
    : null;

  const present  = students.filter((x) => ["present", "late"].includes(x.attendance?.status ?? "")).length;
  const absent   = students.filter((x) => x.attendance?.status === "absent").length;
  const gpsFail  = students.filter((x) => x.attendance?.status === "gps_fail").length;
  const total    = students.length;
  const checkUrl = `/check?s=${sessionId}&o=${s.otp}&sid=${spreadsheetId}`;
  const pendingStudents = students.filter((x) => !x.attendance);

  // Issue counts for summary bar
  const gpsFailCount       = students.filter((x) => x.attendance?.status === "gps_fail").length;
  const deviceConflictCount = conflictSet.size;
  const lateCount          = students.filter((x) => x.attendance?.status === "late").length;
  const flaggedCount        = students.filter((x) => x.attendance?.flagged).length;
  const totalIssues        = gpsFailCount + deviceConflictCount + lateCount + flaggedCount;
  const visibleStudents    = issueFilter
    ? students.filter((stu) => getIssues(stu, conflictSet).includes(issueFilter))
    : students;

  // Action row — one row, never wraps onto the title/clock row. Frequent actions sit left,
  // a flex spacer pushes the rare/destructive action to the far right. Scrolls horizontally
  // on very narrow screens instead of wrapping.
  const ActionRow = (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      {!isClosed ? (
        <>
          <Link href={`/projector/${sessionId}`} target="_blank" className="btn-outline text-[13px] shrink-0 whitespace-nowrap" style={{ minHeight: 34, padding: "7px 12px" }}>
            <IconScreen size={13} /> Projector View
          </Link>
          <button onClick={openManualQR} className="btn-outline text-[13px] shrink-0 whitespace-nowrap" style={{ minHeight: 34, padding: "7px 12px" }}>
            <IconQR size={13} /> Manual QR
          </button>
          <button
            onClick={() => { setShowManual(true); setManualError(""); }}
            className="btn-outline text-[13px] shrink-0 whitespace-nowrap"
            style={{ minHeight: 34, padding: "7px 12px" }}
          >
            + Manual Record
          </button>
          <button onClick={exportCsv} className="btn-outline text-[13px] shrink-0 whitespace-nowrap" style={{ minHeight: 34, padding: "7px 12px" }}>
            <IconDownload size={13} /> Export CSV
          </button>
          <div className="flex-1 min-w-[8px]" />
          <button onClick={() => setShowClose(true)} className="btn-danger text-[13px] shrink-0 whitespace-nowrap" style={{ minHeight: 34, padding: "7px 12px" }}>
            <IconStop size={13} /> Close Session
          </button>
        </>
      ) : (
        <>
          <span className="badge-absent px-3 py-1.5 text-[13px] shrink-0">Closed</span>
          {!s.is_past_session && (
            <button onClick={openReopenSettings} className="btn-outline text-[13px] shrink-0 whitespace-nowrap" style={{ minHeight: 34, padding: "7px 12px" }}>
              Re-Generate OTP
            </button>
          )}
          <div className="flex-1 min-w-[8px]" />
          <button onClick={exportCsv} className="btn-outline text-[13px] shrink-0 whitespace-nowrap" style={{ minHeight: 34, padding: "7px 12px" }}>
            <IconDownload size={13} /> Export CSV
          </button>
        </>
      )}
    </div>
  );

  const STATUS_LABELS: Record<AttendanceStatus, string> = {
    present: "Present ✓", late: "Late L", absent: "Absent —", gps_fail: "GPS ⚠",
  };
  const STATUS_COLORS: Record<AttendanceStatus, string> = {
    present: "#3B6D11", late: "#185FA5", absent: "#A32D2D", gps_fail: "#854F0B",
  };

  return (
    <div>
      {/* Session status card: title/clock, actions, divider, stats grid, progress — all one card */}
      <div className="card mb-4">
        {/* Row 1: title + live status (left) / clock (right) */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-[18px] font-medium text-gray-900 flex items-center gap-2 flex-wrap">
              {s.course_id} — {periodLabel}
              {partBadge && <span className="text-[14px]" style={{ color: "#185FA5" }}>{partBadge}</span>}
              {!isClosed && (
                <span className="badge-live">
                  <span className="live-dot" /> Live
                </span>
              )}
            </h1>
            <p className="text-[11px] mt-0.5" style={{ color: "#5F5E5A" }}>
              {s.date} · Section {s.section}
              {s.week_label && <span className="ml-2">{s.week_label}</span>}
              {lastUpdated && <span className="ml-2">· Updated {lastUpdated.toLocaleTimeString("th-TH")}</span>}
            </p>
          </div>

          {clock.time && (
            <div className="text-right leading-tight shrink-0">
              <p className="text-[12px]" style={{ color: "#5F5E5A" }}>{clock.date}</p>
              <p className="text-[24px] font-medium" style={{ fontFamily: "ui-monospace, monospace", fontVariantNumeric: "tabular-nums" }}>{clock.time}</p>
            </div>
          )}
        </div>

        {/* Row 2: actions — its own dedicated row, never wraps onto row 1 */}
        <div className="mt-2.5">{ActionRow}</div>

        {/* Divider */}
        <div className="my-3" style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }} />

        {/* Stats grid: 4 small cards + 1 wide OTP/Radius card */}
        <div className="grid grid-cols-2 lg:grid-cols-[repeat(4,1fr)_2fr] gap-2">
          <Stat label="Total"    value={total}   caption="enrolled"   color="#374151" />
          <Stat label="Present"  value={present} caption="checked in" color="#3B6D11" />
          <Stat label="Absent"   value={absent}  caption="no show"    color="#A32D2D" />
          <Stat label="GPS fail" value={gpsFail} caption="flagged"    color="#854F0B" />

          <div className="col-span-2 lg:col-span-1 rounded-xl px-3 py-2.5 flex items-center justify-between gap-3"
            style={{ backgroundColor: "#f9fafb", border: "0.5px solid rgba(0,0,0,0.06)" }}>
            {!isClosed ? (
              <>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "#9ca3af" }}>OTP Code</p>
                  <p className="text-[26px] font-bold tracking-widest leading-none" style={{ fontFamily: "ui-monospace, monospace", color: "#185FA5", fontVariantNumeric: "tabular-nums" }}>
                    {s.otp}
                  </p>
                  {otpSecondsLeft !== null && (
                    <p className="text-[10px] mt-1" style={{ color: otpSecondsLeft < 60 ? "#A32D2D" : "#9ca3af" }}>
                      Expires in {otpSecondsLeft > 0
                        ? `${String(Math.floor(otpSecondsLeft / 60)).padStart(2, "0")}:${String(otpSecondsLeft % 60).padStart(2, "0")}`
                        : "หมดอายุ"}
                    </p>
                  )}
                </div>
                <div className="text-right text-[11px] shrink-0" style={{ color: "#6b7280" }}>
                  <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "#9ca3af" }}>Radius</p>
                  <p>R {s.radius_m}m</p>
                  <p>{s.late_enabled === false ? "L Off" : `L >${s.late_after_min}m`}</p>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between w-full">
                <span className="badge-absent">Closed</span>
                {!s.is_past_session && (
                  <button onClick={openReopenSettings} className="btn-outline text-[12px]" style={{ minHeight: 32, padding: "6px 10px" }}>
                    Re-Generate OTP
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Progress bar — sits directly under the stats, no dead space */}
        <div className="mt-2">
          <div className="flex justify-between text-[12px] mb-1">
            <span className="font-medium text-gray-700">Checked In</span>
            <span className="text-gray-500" style={{ fontVariantNumeric: "tabular-nums" }}>{present}/{total}</span>
          </div>
          <div className="h-1.5 rounded-full" style={{ backgroundColor: "#e5e7eb" }}>
            <div className="h-full rounded-full transition-all"
              style={{ width: total > 0 ? `${(present / total) * 100}%` : "0%", backgroundColor: "#3B6D11" }} />
          </div>
        </div>
      </div>

      {/* Single column layout */}
      <div className="space-y-4">

        {/* Linked session card */}
        {isDoubleCheckIn && linked_session && (
          <div className="card" style={{ border: "1px solid #185FA5" }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12px] font-medium" style={{ color: "#185FA5" }}>
                Double Period — Two Check-ins
              </p>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <div className="space-y-1">
                <p style={{ color: "#374151" }}>
                  <span className="font-medium">① Part 1</span>{" "}
                  {s.part_number === 1 ? (
                    <span className="rounded px-1.5 py-0.5" style={{ backgroundColor: isClosed ? "#FCEBEB" : "#E6F1FB", color: isClosed ? "#A32D2D" : "#185FA5", fontSize: 11 }}>
                      {isClosed ? "Closed" : "Active"}
                    </span>
                  ) : (
                    <Link href={`/admin/session/${linked_session.session_id}`} className="underline" style={{ color: "#185FA5" }}>
                      {linked_session.closed_at ? "Closed" : linked_session.opened_at ? "Active" : "Not opened"}
                    </Link>
                  )}
                </p>
                <p style={{ color: "#374151" }}>
                  <span className="font-medium">② Part 2</span>{" "}
                  {s.part_number === 2 ? (
                    <span className="rounded px-1.5 py-0.5" style={{ backgroundColor: isClosed ? "#FCEBEB" : "#E6F1FB", color: isClosed ? "#A32D2D" : "#185FA5", fontSize: 11 }}>
                      {isClosed ? "Closed" : "Active"}
                    </span>
                  ) : (
                    <span className="rounded px-1.5 py-0.5" style={{ backgroundColor: linked_session.closed_at ? "#FCEBEB" : linked_session.opened_at ? "#EAF3DE" : "#f3f4f6", color: linked_session.closed_at ? "#A32D2D" : linked_session.opened_at ? "#3B6D11" : "#6b7280", fontSize: 11 }}>
                      {linked_session.closed_at ? "Closed" : linked_session.opened_at ? "Active" : "Not opened"}
                    </span>
                  )}
                </p>
              </div>
              {s.part_number === 1 && isClosed && !linked_session.opened_at && (
                <button
                  onClick={() => handleActivatePart2(linked_session.session_id)}
                  disabled={activatingPart2}
                  className="btn-primary text-[12px]"
                  style={{ minHeight: 36 }}
                >
                  {activatingPart2 ? <Spinner className="h-3 w-3" /> : "Open Part 2 →"}
                </button>
              )}
              {s.part_number === 2 && (
                <Link href={`/admin/session/${linked_session.session_id}`} className="btn-outline text-[12px]" style={{ minHeight: 36 }}>
                  ← View Part 1
                </Link>
              )}
            </div>
          </div>
        )}

          {/* Part 1 → Part 2 comparison panel */}
          {s.part_number === 2 && part1Map && part1Map.size > 0 && (
            <div className="card" style={{ border: "1px solid rgba(0,0,0,0.08)" }}>
              <h3 className="font-medium text-gray-900 text-[13px] mb-2">Part 1 → Part 2 Comparison</h3>
              <div className="space-y-1.5">
                {students.map((stu) => {
                  const p1Status = part1Map.get(stu.student_id);
                  const p2Status = stu.attendance?.status;
                  if (!p1Status || p1Status === "absent") return null;
                  if (p1Status === p2Status) return null;
                  return (
                    <div key={stu.student_id} className="flex items-center gap-2 text-[12px]">
                      <span className="font-mono text-gray-400 w-22">{stu.student_id}</span>
                      <span className="flex-1 truncate">{stu.firstname} {stu.lastname}</span>
                      <span className="font-medium" style={{ color: "#185FA5" }}>{p1Status}</span>
                      <span className="text-gray-400">→</span>
                      <span className="font-medium" style={{ color: p2Status ? "#A32D2D" : "#9ca3af" }}>
                        {p2Status ?? "Pending"}
                      </span>
                    </div>
                  );
                }).filter(Boolean)}
                {students.filter((stu) => {
                  const p1s = part1Map.get(stu.student_id);
                  const p2s = stu.attendance?.status;
                  return p1s && p1s !== "absent" && p1s !== p2s;
                }).length === 0 && (
                  <p className="text-[12px] text-gray-400">No status changes between Part 1 and Part 2.</p>
                )}
              </div>
            </div>
          )}

          {/* Confirmed device conflict banner — same fingerprint or GPU hash */}
          {confirmedConflicts.length > 0 && !conflictDismissed && (
            <div className="rounded-xl px-4 py-2.5" style={{ backgroundColor: "#FAEEDA", border: "1px solid #EF9F27" }}>
              <div className="flex items-center gap-2">
                <IconWarning size={13} className="text-[#854F0B] shrink-0" />
                <span className="text-[12px] font-medium flex-1" style={{ color: "#78350F" }}>
                  {conflictSet.size} students checked in from the same device
                </span>
                <button
                  onClick={() => setConflictsExpanded((v) => !v)}
                  className="text-[11px] underline shrink-0"
                  style={{ color: "#854F0B", background: "none", border: "none", cursor: "pointer" }}
                >
                  {conflictsExpanded ? <>Hide <IconChevronUp size={10} className="inline" /></> : <>Details <IconChevronDown size={10} className="inline" /></>}
                </button>
                <button
                  onClick={() => {
                    setConflictDismissed(true);
                    sessionStorage.setItem(`conflict_dismissed_${sessionId}`, "1");
                  }}
                  className="text-gray-400 hover:text-gray-600 shrink-0"
                  style={{ background: "none", border: "none", cursor: "pointer", lineHeight: 1 }}
                >
                  ✕
                </button>
              </div>
              {conflictsExpanded && (
                <div className="mt-2 space-y-2">
                  {confirmedConflicts.map((c) => (
                    <div key={c.id}>
                      <p className="text-[11px] font-medium mb-1" style={{ color: "#78350F" }}>
                        {c.students.length} students — same device:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {c.students.map((st) => (
                          <span key={st.student_id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px]"
                            style={{ backgroundColor: "rgba(0,0,0,0.08)", color: "#78350F" }}>
                            {st.firstname} {st.lastname}
                            {st.status && <span className="opacity-60">({st.status})</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Possible conflict banner — same IP + checked in close together in time/location, but no device-level match */}
          {possibleConflicts.length > 0 && !possibleDismissed && (
            <div className="rounded-xl px-4 py-2.5" style={{ backgroundColor: "#E6F1FB", border: "1px solid #7AB8F5" }}>
              <div className="flex items-center gap-2">
                <IconWarning size={13} className="text-[#185FA5] shrink-0" />
                <span className="text-[12px] font-medium flex-1" style={{ color: "#1e3a5f" }}>
                  {possibleConflicts.reduce((sum, c) => sum + c.students.length, 0)} students checked in unusually close together — worth a look
                </span>
                <button
                  onClick={() => setPossibleExpanded((v) => !v)}
                  className="text-[11px] underline shrink-0"
                  style={{ color: "#185FA5", background: "none", border: "none", cursor: "pointer" }}
                >
                  {possibleExpanded ? <>Hide <IconChevronUp size={10} className="inline" /></> : <>Details <IconChevronDown size={10} className="inline" /></>}
                </button>
                <button
                  onClick={() => {
                    setPossibleDismissed(true);
                    sessionStorage.setItem(`conflict_possible_dismissed_${sessionId}`, "1");
                  }}
                  className="text-gray-400 hover:text-gray-600 shrink-0"
                  style={{ background: "none", border: "none", cursor: "pointer", lineHeight: 1 }}
                >
                  ✕
                </button>
              </div>
              {possibleExpanded && (
                <div className="mt-2 space-y-2">
                  <p className="text-[11px]" style={{ color: "#1e3a5f" }}>
                    Same network, checked in within ~30s and ~10m of each other — different devices, so not certain. Verify manually if needed.
                  </p>
                  {possibleConflicts.map((c) => (
                    <div key={c.id}>
                      <p className="text-[11px] font-medium mb-1" style={{ color: "#1e3a5f" }}>
                        {c.students.length} students:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {c.students.map((st) => (
                          <span key={st.student_id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px]"
                            style={{ backgroundColor: "rgba(24,95,165,0.1)", color: "#1e3a5f" }}>
                            {st.firstname} {st.lastname}
                            {st.status && <span className="opacity-60">({st.status})</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Issue summary bar — click a chip to filter the list below, click again to clear */}
          {totalIssues > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 rounded-lg text-[15px]"
              style={{ backgroundColor: "#f9fafb", border: "0.5px solid rgba(0,0,0,0.08)" }}>
              <span className="font-medium text-gray-500">Issues:</span>
              {gpsFailCount > 0 && (
                <IssueChip active={issueFilter === "gps_fail"} color="#ef4444"
                  onClick={() => setIssueFilter((f) => f === "gps_fail" ? null : "gps_fail")}>
                  GPS Fail {gpsFailCount}
                </IssueChip>
              )}
              {deviceConflictCount > 0 && (
                <IssueChip active={issueFilter === "device_conflict"} color="#f97316"
                  onClick={() => setIssueFilter((f) => f === "device_conflict" ? null : "device_conflict")}>
                  Same Device {deviceConflictCount}
                </IssueChip>
              )}
              {lateCount > 0 && (
                <IssueChip active={issueFilter === "late"} color="#ca8a04"
                  onClick={() => setIssueFilter((f) => f === "late" ? null : "late")}>
                  Late {lateCount}
                </IssueChip>
              )}
              {flaggedCount > 0 && (
                <IssueChip active={issueFilter === "flagged"} color="#a855f7"
                  onClick={() => setIssueFilter((f) => f === "flagged" ? null : "flagged")}>
                  Flagged {flaggedCount}
                </IssueChip>
              )}
              {issueFilter && (
                <button
                  onClick={() => setIssueFilter(null)}
                  className="text-[13px] text-gray-400 hover:text-gray-600 underline ml-1"
                  style={{ background: "none", border: "none", cursor: "pointer" }}
                >
                  Clear filter
                </button>
              )}
            </div>
          )}

          <div className="card overflow-hidden">
            <h2 className="font-semibold text-gray-900 mb-3 text-[18px]">
              Student List
              {issueFilter && (
                <span className="text-[13px] font-normal text-gray-400 ml-2">
                  — filtered by {ISSUE_FILTER_LABELS[issueFilter]}
                </span>
              )}
            </h2>
            <div className="divide-y divide-gray-50">
              {visibleStudents.length === 0 && (
                <p className="text-[14px] text-gray-400 py-6 text-center">No students match this filter</p>
              )}
              {visibleStudents.map((stu) => {
                const att    = stu.attendance;
                const issues = att ? getIssues(stu, conflictSet) : [];
                const hasIssues    = issues.length > 0;
                const primaryIssue = issues[0];
                // "late" and "gps_fail" are already shown by the status pill — don't repeat them as tags
                const issueTags    = issues.filter((issue) => issue !== "late" && issue !== "gps_fail");
                const isActioning  = actioning === att?.attendance_id;

                return (
                  <div
                    key={stu.student_id}
                    className="py-3 grid items-center gap-3 text-[16px]"
                    style={{
                      gridTemplateColumns: "2rem 7rem 12rem minmax(0,1fr) auto 2rem",
                      ...(hasIssues
                        ? { borderLeft: `3px solid ${BORDER_COLORS[primaryIssue]}`, paddingLeft: 8 }
                        : { paddingLeft: 8 }),
                    }}
                  >
                    <span className="text-gray-300 text-[16px] text-right font-mono">{stu.order_num}</span>
                    <span className="font-mono text-[16px] text-gray-500">{stu.student_id}</span>
                    <span className="truncate">{stu.firstname} {stu.lastname}</span>

                    {/* Descriptive column — status + issue tags + approval note, never clickable */}
                    <span className="flex flex-wrap items-center gap-1.5 min-w-0">
                      {att ? (
                        <span
                          className={`${
                            att.status === "present" ? "badge-present" :
                            att.status === "late"    ? "badge-late"    :
                            att.status === "absent"  ? "badge-absent"  : "badge-gps"
                          } shrink-0 text-[15px] px-3 py-1.5`}
                        >
                          {att.status === "present" ? "Present" :
                           att.status === "late"    ? "Late"    :
                           att.status === "absent"  ? "Absent"  : "GPS fail"}
                        </span>
                      ) : (
                        <span className="badge-waiting text-[15px] px-3 py-1.5 shrink-0">Pending</span>
                      )}
                      {issueTags.map((issue) => <IssueBadge key={issue} type={issue} />)}
                      {att?.overridden && (
                        <span className="badge-waiting text-[12px] px-2 py-1 shrink-0" title="Approved by teacher">
                          ✓ Approved{att.edit_note ? ` — ${att.edit_note}` : ""}
                        </span>
                      )}
                    </span>

                    {/* Action column — the only clickable controls in the row */}
                    <div className="flex items-center justify-end gap-1.5">
                      {att && hasIssues && (
                        isActioning ? (
                          <Spinner className="h-4 w-4 shrink-0" />
                        ) : (
                          <ActionButtons
                            status={att.status}
                            overridden={att.overridden}
                            onAction={(action) => {
                              const studentName = `${stu.firstname} ${stu.lastname}`;
                              // Only note issues that *disappear* once approved (status changes away
                              // from late/gps_fail) — device_conflict/flagged stay visible as their own
                              // tag regardless, so repeating them here would just duplicate that tag.
                              const vanishingIssues = issues.filter((i) => i === "late" || i === "gps_fail");
                              const note = action === "approve" && vanishingIssues.length > 0
                                ? vanishingIssues.map((i) => ISSUE_LABELS[i]).join(", ")
                                : undefined;
                              handleAction(att!.attendance_id, action, studentName, note);
                            }}
                            disabled={!!actioning}
                          />
                        )
                      )}
                    </div>

                    {/* ⋯ row menu trigger */}
                    <div className="flex justify-end">
                      {att && (
                        <button
                          onClick={(e) => openRowMenu(e, stu)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 22, lineHeight: 1, padding: "6px 8px" }}
                          title="More"
                        >
                          ⋯
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
      </div>

      {/* Edit status modal */}
      {editPopover && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
          <div ref={editRef} className="card max-w-sm w-full space-y-4">
            <div>
              <h3 className="font-medium text-gray-900">Edit Attendance Status</h3>
              <p className="text-[12px] mt-0.5" style={{ color: "#5F5E5A" }}>
                {editPopover.studentName} · {editPopover.studentId}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["present", "late", "absent", "gps_fail"] as AttendanceStatus[]).map((st) => (
                <button
                  key={st}
                  onClick={() => setEditStatus(st)}
                  className="rounded-lg px-3 py-2 text-[12px] font-medium capitalize transition-colors"
                  style={{ backgroundColor: editStatus === st ? STATUS_COLORS[st] : "#f3f4f6", color: editStatus === st ? "white" : "#374151", border: "none", cursor: "pointer" }}
                >
                  {STATUS_LABELS[st]}
                </button>
              ))}
            </div>
            <div>
              <label className="block text-[12px] font-medium text-gray-700 mb-1">เหตุผล (ถ้ามี)</label>
              <input className="input text-[13px]" value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Reason for change..." />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditPopover(null)} className="btn-outline flex-1 text-[13px]" style={{ minHeight: 36 }}>Cancel</button>
              <button
                onClick={submitEdit}
                disabled={editSaving || editStatus === editPopover.currentStatus}
                className="btn-primary flex-1 text-[13px]"
                style={{ minHeight: 36 }}
              >
                {editSaving ? <Spinner className="h-4 w-4" /> : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteAttId && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
          <div className="card max-w-sm w-full space-y-4">
            <h3 className="font-medium text-gray-900">Delete Attendance Record?</h3>
            <p className="text-[13px] text-gray-600">
              The student will show as <strong>Pending</strong> again in this session.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteAttId(null)} className="btn-outline flex-1">Cancel</button>
              <button onClick={handleDeleteAtt} disabled={deletingAtt} className="btn-danger flex-1">
                {deletingAtt ? <Spinner className="h-4 w-4" /> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add manual record modal */}
      {showManual && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
          <div className="card max-w-sm w-full space-y-4">
            <h3 className="font-medium text-gray-900">Add Manual Attendance</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1">Student</label>
                <select className="input text-[13px]" value={manualForm.student_id}
                  onChange={(e) => setManualForm((f) => ({ ...f, student_id: e.target.value }))}>
                  <option value="">-- Select student --</option>
                  {pendingStudents.map((stu) => (
                    <option key={stu.student_id} value={stu.student_id}>
                      {stu.student_id} — {stu.firstname} {stu.lastname}
                    </option>
                  ))}
                  {students.filter((stu) => stu.attendance).map((stu) => (
                    <option key={stu.student_id} value={stu.student_id} disabled>
                      {stu.student_id} — {stu.firstname} {stu.lastname} ({stu.attendance?.status})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1">Status</label>
                <div className="flex gap-2">
                  {(["present", "late", "absent"] as AttendanceStatus[]).map((st) => (
                    <button
                      key={st}
                      onClick={() => setManualForm((f) => ({ ...f, status: st }))}
                      className="flex-1 rounded-lg py-2 text-[12px] font-medium capitalize"
                      style={{ backgroundColor: manualForm.status === st ? STATUS_COLORS[st] : "#f3f4f6", color: manualForm.status === st ? "white" : "#374151", border: "none", cursor: "pointer" }}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1">หมายเหตุ (ถ้ามี)</label>
                <input className="input text-[13px]" value={manualForm.note} onChange={(e) => setManualForm((f) => ({ ...f, note: e.target.value }))} />
              </div>
              {manualError && <p className="text-[12px]" style={{ color: "#A32D2D" }}>{manualError}</p>}
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowManual(false); setManualError(""); }} className="btn-outline flex-1">Cancel</button>
              <button onClick={handleAddManual} disabled={manualSaving || !manualForm.student_id} className="btn-primary flex-1">
                {manualSaving ? <Spinner className="h-4 w-4" /> : "Add Record"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual QR modal */}
      {showManualQR && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={() => setShowManualQR(false)}>
          <div className="card max-w-xs w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-900">Manual Check-In QR</h3>
              <button onClick={() => setShowManualQR(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
            </div>
            <div className="flex flex-col items-center gap-3">
              {manualQrDataUrl ? (
                <img src={manualQrDataUrl} alt="Manual check-in QR" width={250} height={250} style={{ imageRendering: "crisp-edges" }} />
              ) : (
                <div className="w-[250px] h-[250px] rounded-lg bg-gray-100 flex items-center justify-center">
                  <Spinner className="h-6 w-6 text-[#185FA5]" />
                </div>
              )}
              <p className="text-[11px] text-gray-400 text-center">
                {typeof window !== "undefined" ? window.location.origin : ""}/check
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={copyCheckUrl} className="btn-outline flex-1 text-[13px]">Copy URL</button>
              <button onClick={downloadManualQR} disabled={!manualQrDataUrl} className="btn-outline flex-1 text-[13px] flex items-center justify-center gap-1">
                <IconDownload size={13} /> Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close session modal */}
      {showClose && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="card max-w-sm w-full space-y-4" role="dialog" aria-modal="true" aria-labelledby="close-session-title">
            <h3 id="close-session-title" className="font-medium text-gray-900">Close Session?</h3>
            <p className="text-[13px] text-gray-600">
              <strong>{total - present - gpsFail - absent} students</strong> who haven&apos;t checked in will be marked <em>Absent</em>.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowClose(false)} className="btn-outline flex-1">Cancel</button>
              <button onClick={handleClose} disabled={closing} className="btn-danger flex-1 flex items-center justify-center gap-2">
                {closing && <Spinner className="h-4 w-4" />}
                Close Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Re-generate OTP settings modal */}
      {showReopenSettings && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="card max-w-sm w-full space-y-4" role="dialog" aria-modal="true" aria-labelledby="reopen-title">
            <div>
              <h3 id="reopen-title" className="font-medium text-gray-900">Re-Generate OTP</h3>
              <p className="text-[12px] mt-0.5" style={{ color: "#5F5E5A" }}>
                Generates a new code and restarts the countdown. Adjust the settings below if needed, or leave them as-is.
              </p>
              {!isToday && (
                <p className="text-[12px] mt-2 rounded-lg px-3 py-2" style={{ backgroundColor: "#FEF9EC", color: "#854F0B", border: "0.5px solid #EF9F27" }}>
                  This session was held on {s.date}, not today — new check-ins will be timestamped now but recorded under that date.
                </p>
              )}
            </div>
            <div className="space-y-4">
              <Slider label="GPS Radius" value={reopenForm.radius_m} min={50} max={500} step={10} unit="m"
                onChange={(v) => setReopenForm((f) => ({ ...f, radius_m: v }))} />
              <Slider label="OTP Expires After" value={reopenForm.otp_expire_min} min={1} max={60} step={1} unit="min"
                onChange={(v) => setReopenForm((f) => ({ ...f, otp_expire_min: v }))} />
              <div className="h-px" style={{ backgroundColor: "rgba(0,0,0,0.08)" }} />
              <Toggle label="Enable late status" checked={reopenForm.late_enabled}
                onChange={(v) => setReopenForm((f) => ({ ...f, late_enabled: v }))} />
              <div className={reopenForm.late_enabled ? "" : "opacity-40 pointer-events-none"}>
                <Slider label="Late After" value={reopenForm.late_after_min} min={1} max={60} step={1} unit="min"
                  onChange={(v) => setReopenForm((f) => ({ ...f, late_after_min: v }))} />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowReopenSettings(false)} className="btn-outline flex-1">Cancel</button>
              <button onClick={handleReopen} disabled={reopening} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {reopening && <Spinner className="h-4 w-4" />}
                Re-Generate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Undo toast for mark_absent */}
      {undoToast && (
        <UndoToast
          message={`${undoToast.studentName} marked absent`}
          onUndo={handleUndo}
          onDismiss={() => setUndoToast(null)}
        />
      )}

      {/* Row ⋯ menu portal */}
      {rowMenu && typeof window !== "undefined" && createPortal(
        <div
          ref={rowMenuRef}
          style={{
            position: "fixed",
            top:    rowMenu.top,
            left:   rowMenu.left,
            width:  150,
            zIndex: 9999,
            backgroundColor: "white",
            border: "0.5px solid rgba(0,0,0,0.12)",
            borderRadius: 12,
            boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
            padding: "4px 0",
            animation: "dd-appear 0.15s ease",
            transformOrigin: rowMenu.openUpward ? "bottom center" : "top center",
          }}
        >
          <style>{`@keyframes dd-appear{from{opacity:0;transform:scaleY(0.92)}to{opacity:1;transform:scaleY(1)}}`}</style>
          <button
            onClick={rowMenu.onEdit}
            className="block w-full text-left px-3 py-2 text-[13px] hover:bg-gray-50 transition-colors"
            style={{ background: "none", border: "none", cursor: "pointer", color: "#374151" }}
          >
            Edit Status
          </button>
          {rowMenu.onFlag && (
            <button
              onClick={rowMenu.onFlag}
              className="block w-full text-left px-3 py-2 text-[13px] hover:bg-gray-50 transition-colors"
              style={{ background: "none", border: "none", cursor: "pointer", color: "#7e22ce" }}
            >
              Flag as suspicious
            </button>
          )}
          {rowMenu.onRevoke && (
            <button
              onClick={rowMenu.onRevoke}
              className="block w-full text-left px-3 py-2 text-[13px] hover:bg-gray-50 transition-colors"
              style={{ background: "none", border: "none", cursor: "pointer", color: "#374151" }}
            >
              Revoke Approval
            </button>
          )}
          <button
            onClick={rowMenu.onDelete}
            className="block w-full text-left px-3 py-2 text-[13px] hover:bg-gray-50 transition-colors"
            style={{ background: "none", border: "none", cursor: "pointer", color: "#A32D2D" }}
          >
            Delete Record
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}

function Stat({ label, value, caption, color }: { label: string; value: number; caption: string; color: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ backgroundColor: "#f9fafb", border: "0.5px solid rgba(0,0,0,0.06)" }}>
      <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "#9ca3af" }}>{label}</p>
      <p className="text-[20px] font-semibold leading-tight" style={{ color, fontVariantNumeric: "tabular-nums" }}>{value}</p>
      <p className="text-[10px]" style={{ color: "#9ca3af" }}>{caption}</p>
    </div>
  );
}
