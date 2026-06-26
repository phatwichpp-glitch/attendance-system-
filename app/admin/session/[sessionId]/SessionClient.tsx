"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import Spinner from "@/components/Spinner";
import {
  IconScreen, IconStop, IconDownload, IconWarning, IconCheck,
  IconClock, IconChevronDown, IconChevronUp, IconQR,
} from "@/components/icons";
import { Session, StudentWithAttendance, DeviceConflict } from "@/types";

interface Data {
  session: Session;
  students: StudentWithAttendance[];
  spreadsheetId: string;
  device_conflicts: DeviceConflict[];
}

export default function SessionClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showClose, setShowClose] = useState(false);
  const [closing, setClosing] = useState(false);
  const [overriding, setOverriding] = useState<string | null>(null);
  const [conflictsExpanded, setConflictsExpanded] = useState(false);
  const [showManualQR, setShowManualQR] = useState(false);
  const [manualQrDataUrl, setManualQrDataUrl] = useState("");

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

  const handleClose = async () => {
    if (!data) return;
    setClosing(true);
    try {
      await fetch("/api/sheets/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, course_id: data.session.course_id, section: data.session.section }),
      });
      localStorage.removeItem("active_session");
      router.push("/admin");
    } finally {
      setClosing(false);
    }
  };

  const openManualQR = async () => {
    setShowManualQR(true);
    if (!manualQrDataUrl) {
      const url = window.location.origin + "/check";
      const dataUrl = await QRCode.toDataURL(url, { width: 500, margin: 2 });
      setManualQrDataUrl(dataUrl);
    }
  };

  const downloadManualQR = () => {
    if (!manualQrDataUrl) return;
    const a = document.createElement("a");
    a.href = manualQrDataUrl;
    a.download = "attendance-qr-manual.png";
    a.click();
  };

  const copyCheckUrl = () => {
    navigator.clipboard.writeText(window.location.origin + "/check");
  };

  const handleOverride = async (attendanceId: string) => {
    setOverriding(attendanceId);
    try {
      await fetch("/api/sheets/override", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendance_id: attendanceId }),
      });
      await fetchData();
    } finally {
      setOverriding(null);
    }
  };

  const exportCsv = () => {
    if (!data) return;
    const rows = [
      ["#", "Student ID", "First Name", "Last Name", "Status", "Distance (m)", "Time", "device_fingerprint"],
      ...data.students.map((s) => [
        s.order_num,
        s.student_id,
        s.firstname,
        s.lastname,
        s.attendance?.status ?? "absent",
        s.attendance?.distance_m ?? "",
        s.attendance?.checked_at ? new Date(s.attendance.checked_at).toLocaleTimeString("th-TH") : "",
        s.attendance?.device_fingerprint ?? "",
      ]),
    ];
    const csv = "﻿" + rows.map((r) => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
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

  const { session: s, students, spreadsheetId, device_conflicts } = data;
  const isClosed = !!s.closed_at;
  const present  = students.filter((x) => ["present", "late"].includes(x.attendance?.status ?? "")).length;
  const absent   = students.filter((x) => x.attendance?.status === "absent").length;
  const gpsFail  = students.filter((x) => x.attendance?.status === "gps_fail").length;
  const total    = students.length;
  const checkUrl = `/check?s=${sessionId}&o=${s.otp}&sid=${spreadsheetId}`;

  const ActionButtons = (
    <div className="flex gap-2 flex-wrap">
      {!isClosed && (
        <>
          <Link href={`/projector/${sessionId}`} target="_blank" className="btn-outline text-[13px]" style={{ minHeight: 40 }}>
            <IconScreen size={14} /> Projector View
          </Link>
          <button onClick={openManualQR} className="btn-outline text-[13px]" style={{ minHeight: 40 }}>
            <IconQR size={14} /> Manual QR
          </button>
          <button onClick={() => setShowClose(true)} className="btn-danger text-[13px]" style={{ minHeight: 40 }}>
            <IconStop size={14} /> Close Session
          </button>
        </>
      )}
      {isClosed && <span className="badge-absent px-3 py-2 text-[13px]">Closed</span>}
      <button onClick={exportCsv} className="btn-outline text-[13px]" style={{ minHeight: 40 }}>
        <IconDownload size={14} /> Export CSV
      </button>
    </div>
  );

  return (
    <div>
      {/* ── Sticky secondary header (md+) ─────────────────────────── */}
      <div
        className="hidden md:flex items-center justify-between py-3 mb-4"
        style={{ borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}
      >
        <div>
          <h1 className="text-[18px] font-medium text-gray-900">{s.course_id} — Period {s.period}</h1>
          <p className="text-[11px] mt-0.5" style={{ color: "#5F5E5A" }}>
            {s.date} · Section {s.section}
            {lastUpdated && <span className="ml-2">· Last updated {lastUpdated.toLocaleTimeString("th-TH")}</span>}
          </p>
        </div>
        {ActionButtons}
      </div>

      {/* ── Mobile header ─────────────────────────────────────────── */}
      <div className="md:hidden flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-[18px] font-medium text-gray-900">{s.course_id} — Period {s.period}</h1>
          <p className="text-[11px] mt-0.5" style={{ color: "#5F5E5A" }}>{s.date} · Section {s.section}</p>
          {lastUpdated && (
            <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
              <IconClock size={11} /> {lastUpdated.toLocaleTimeString("th-TH")}
            </p>
          )}
        </div>
        {ActionButtons}
      </div>

      {/* ── iPad 2-column grid ────────────────────────────────────── */}
      <div className="md:grid md:grid-cols-[35%_1fr] md:gap-4 md:items-start space-y-4 md:space-y-0">

        {/* Left col: stats + OTP + progress */}
        <div className="space-y-4">
          {/* Stats — 4-col mobile, 2×2 on md */}
          <div className="grid grid-cols-4 md:grid-cols-2 gap-3">
            <Stat label="Total"    value={total}   bg="#f3f4f6" color="#374151" />
            <Stat label="Present"  value={present} bg="#EAF3DE" color="#3B6D11" />
            <Stat label="Absent"   value={absent}  bg="#FCEBEB" color="#A32D2D" />
            <Stat label="GPS fail" value={gpsFail} bg="#FAEEDA" color="#854F0B" />
          </div>

          {/* OTP banner */}
          {!isClosed && (
            <div className="card flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] mb-0.5" style={{ color: "#5F5E5A" }}>
                  OTP (expires in {s.otp_expire_min} min)
                </p>
                <p
                  className="text-4xl font-bold tracking-widest"
                  style={{ fontFamily: "ui-monospace, monospace", color: "#185FA5" }}
                >
                  {s.otp}
                </p>
              </div>
              <div className="text-right text-[11px] space-y-1" style={{ color: "#5F5E5A" }}>
                <p>Radius {s.radius_m} m</p>
                <p>Late &gt;{s.late_after_min} min</p>
                <a href={checkUrl} target="_blank" className="text-[#185FA5] underline text-[11px]">
                  Check-in link ↗
                </a>
              </div>
            </div>
          )}

          {/* Progress */}
          <div className="card">
            <div className="flex justify-between text-[13px] text-gray-600 mb-2">
              <span>Checked In</span>
              <span className="font-medium">{present}/{total} students</span>
            </div>
            <div className="h-2 rounded-full" style={{ backgroundColor: "#e5e7eb" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: total > 0 ? `${(present / total) * 100}%` : "0%", backgroundColor: "#3B6D11" }}
              />
            </div>
          </div>
        </div>

        {/* Right col: conflicts + student list */}
        <div className="space-y-4">

          {/* Device conflict warning */}
          {device_conflicts.length > 0 && (
            <DeviceConflictBox
              conflicts={device_conflicts}
              expanded={conflictsExpanded}
              onToggle={() => setConflictsExpanded((v) => !v)}
            />
          )}

          {/* Student list */}
          <div className="card overflow-hidden">
            <h2 className="font-medium text-gray-900 mb-3">Student List</h2>
            <div className="divide-y divide-gray-50">
              {students.map((stu) => {
                const att = stu.attendance;
                return (
                  <div key={stu.student_id} className="py-2.5 flex items-center gap-3 text-[13px]">
                    <span className="text-gray-300 text-[11px] w-5 text-right font-mono">{stu.order_num}</span>
                    <span className="font-mono text-[11px] text-gray-400 w-24">{stu.student_id}</span>
                    <span className="flex-1 min-w-0 truncate">{stu.firstname} {stu.lastname}</span>
                    {att ? (
                      <>
                        <span className={
                          att.status === "present" ? "badge-present" :
                          att.status === "late"    ? "badge-late"    :
                          att.status === "absent"  ? "badge-absent"  : "badge-gps"
                        }>
                          {att.status === "present" ? "Present" :
                           att.status === "late"    ? "Late"    :
                           att.status === "absent"  ? "Absent"  : "GPS fail"}
                        </span>
                        {att.status === "gps_fail" && (
                          <span className="text-[11px] text-gray-400">{att.distance_m}m</span>
                        )}
                        {att.status === "gps_fail" && !att.overridden && !isClosed && (
                          <button
                            onClick={() => handleOverride(att.attendance_id)}
                            disabled={overriding === att.attendance_id}
                            className="btn-outline text-[11px]"
                            style={{ minHeight: 44, padding: "10px 16px" }}
                          >
                            {overriding === att.attendance_id
                              ? <Spinner className="h-3 w-3" />
                              : <><IconCheck size={12} /> Approve</>
                            }
                          </button>
                        )}
                        {att.overridden && <span className="text-[11px] text-gray-400">✓ approved</span>}
                      </>
                    ) : (
                      <span className="badge-waiting">Pending</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

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
                หรือเปิด: <span className="font-mono">{typeof window !== "undefined" ? window.location.origin : ""}/check</span>
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

      {/* Close modal */}
      {showClose && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="card max-w-sm w-full space-y-4">
            <h3 className="font-medium text-gray-900">Close Session?</h3>
            <p className="text-[13px] text-gray-600">
              <strong>{total - present - gpsFail} students</strong> who haven&apos;t checked in will be marked <em>Absent</em>.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowClose(false)} className="btn-outline flex-1">Cancel</button>
              <button
                onClick={handleClose}
                disabled={closing}
                className="btn-danger flex-1 flex items-center justify-center gap-2"
              >
                {closing && <Spinner className="h-4 w-4" />}
                Close Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, bg, color }: { label: string; value: number; bg: string; color: string }) {
  return (
    <div className="rounded-xl p-3 text-center" style={{ backgroundColor: bg }}>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="text-[11px] mt-0.5" style={{ color }}>{label}</p>
    </div>
  );
}

function DeviceConflictBox({
  conflicts,
  expanded,
  onToggle,
}: {
  conflicts: DeviceConflict[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const SHOW_LIMIT = 3;
  const showToggle = conflicts.length > SHOW_LIMIT;
  const visible = showToggle && !expanded ? conflicts.slice(0, SHOW_LIMIT) : conflicts;

  return (
    <div
      className="rounded-xl px-4 py-3 space-y-2"
      style={{ backgroundColor: "#FAEEDA", border: "1px solid #EF9F27" }}
    >
      <div className="flex items-center gap-2">
        <IconWarning size={14} className="text-[#854F0B]" />
        <span className="font-medium text-[13px]" style={{ color: "#78350F" }}>
          Device Conflict Detected
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{ backgroundColor: "#EF9F27", color: "white" }}
        >
          {conflicts.length}
        </span>
      </div>
      <p className="text-[11px]" style={{ color: "#92400E" }}>
        นักศึกษาต่อไปนี้อาจเช็คชื่อจาก device เดียวกัน
      </p>
      {visible.map((c) => (
        <div key={c.fingerprint} className="space-y-1">
          <p className="text-[11px] font-medium" style={{ color: "#78350F" }}>
            Same device — {c.students.length} students:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {c.students.map((st) => (
              <span
                key={st.student_id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px]"
                style={{ backgroundColor: "rgba(0,0,0,0.08)", color: "#78350F" }}
              >
                {st.firstname} {st.lastname}
                {st.status && <span className="opacity-60">({st.status})</span>}
              </span>
            ))}
          </div>
        </div>
      ))}
      {showToggle && (
        <button
          onClick={onToggle}
          className="flex items-center gap-1 text-[11px] font-medium"
          style={{ color: "#854F0B", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          {expanded ? <><IconChevronUp size={12}/> Show less</> : <><IconChevronDown size={12}/> Show {conflicts.length - SHOW_LIMIT} more</>}
        </button>
      )}
    </div>
  );
}
