"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Spinner from "@/components/Spinner";
import { Session, StudentAttendance } from "@/lib/types";

interface SessionData {
  session: Session;
  students: StudentAttendance[];
  spreadsheetId: string;
}

export default function SessionClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [data, setData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [closing, setClosing] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [overriding, setOverriding] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/sheets/session/${sessionId}`);
      if (!res.ok) return;
      const d = await res.json();
      setData(d);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleClose = async () => {
    if (!data) return;
    setClosing(true);
    try {
      await fetch("/api/sheets/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          course_id: data.session.course_id,
          section: data.session.section,
        }),
      });
      router.push("/admin");
    } finally {
      setClosing(false);
    }
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
      ["#", "รหัส", "ชื่อ", "นามสกุล", "สถานะ", "ระยะทาง(m)", "เวลา"],
      ...data.students.map((s) => [
        s.order_num,
        s.student_id,
        s.firstname,
        s.lastname,
        s.attendance?.status ?? "absent",
        s.attendance?.distance_m ?? "",
        s.attendance?.checked_at ?? "",
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `session_${sessionId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return (
    <div className="flex justify-center py-20"><Spinner className="h-8 w-8 text-[#185FA5]" /></div>
  );

  if (!data) return (
    <div className="card text-center py-10 text-[#A32D2D]">ไม่พบข้อมูลคาบเรียน</div>
  );

  const { session, students, spreadsheetId } = data;
  const present = students.filter((s) => s.attendance?.status === "present" || s.attendance?.status === "late").length;
  const absent = students.filter((s) => s.attendance?.status === "absent").length;
  const gpsFail = students.filter((s) => s.attendance?.status === "gps_fail").length;
  const total = students.length;
  const isClosed = !!session.closed_at;

  const projectorUrl = `/projector/${sessionId}`;
  const checkUrl = `/check?s=${sessionId}&o=${session.otp}&sid=${spreadsheetId}`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900">{session.course_id} คาบ {session.period}</h1>
          <p className="text-sm text-gray-500">{session.date} · Section {session.section}</p>
          {lastUpdated && <p className="text-xs text-gray-400 mt-0.5">อัปเดต {lastUpdated.toLocaleTimeString("th-TH")}</p>}
        </div>
        {!isClosed && (
          <div className="flex gap-2 flex-wrap">
            <Link href={projectorUrl} target="_blank" className="btn-outline text-sm flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              ฉายหน้าจอ
            </Link>
            <button onClick={exportCsv} className="btn-outline text-sm">Export CSV</button>
            <button onClick={() => setShowCloseModal(true)} className="btn-danger text-sm">ปิดคาบ</button>
          </div>
        )}
        {isClosed && (
          <div className="flex gap-2">
            <button onClick={exportCsv} className="btn-outline text-sm">Export CSV</button>
            <span className="badge-absent px-3 py-2">ปิดคาบแล้ว</span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="ทั้งหมด" value={total} color="gray" />
        <StatCard label="มา" value={present} color="success" />
        <StatCard label="ขาด" value={absent} color="danger" />
        <StatCard label="GPS ล้มเหลว" value={gpsFail} color="warning" />
      </div>

      {/* OTP display when open */}
      {!isClosed && (
        <div className="card flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">OTP</p>
            <p className="font-mono text-3xl font-bold tracking-widest text-[#185FA5]">{session.otp}</p>
          </div>
          <div className="text-right text-xs text-gray-500">
            <p>รัศมี {session.radius_m}m</p>
            <p>สาย &gt;{session.late_after_min}นาที</p>
          </div>
        </div>
      )}

      {/* Student list */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-3">รายชื่อนักศึกษา</h2>
        <div className="divide-y divide-gray-100">
          {students.map((s) => {
            const att = s.attendance;
            return (
              <div key={s.student_id} className="py-2.5 flex items-center gap-3">
                <span className="text-gray-400 text-xs w-6 text-right">{s.order_num}</span>
                <span className="font-mono text-xs text-gray-500 w-24">{s.student_id}</span>
                <span className="flex-1 text-sm">{s.firstname} {s.lastname}</span>
                {att ? (
                  <span className={
                    att.status === "present" ? "badge-present" :
                    att.status === "late" ? "badge-late" :
                    att.status === "absent" ? "badge-absent" : "badge-gps"
                  }>
                    {att.status === "present" ? "มา" : att.status === "late" ? "สาย" : att.status === "absent" ? "ขาด" : "GPS fail"}
                  </span>
                ) : (
                  <span className="badge-gps">รอ</span>
                )}
                {att?.status === "gps_fail" && !att.overridden && !isClosed && (
                  <button
                    onClick={() => handleOverride(att.attendance_id)}
                    disabled={overriding === att.attendance_id}
                    className="btn-outline text-xs px-2 py-1 flex items-center gap-1"
                  >
                    {overriding === att.attendance_id ? <Spinner className="h-3 w-3" /> : null}
                    อนุมัติ
                  </button>
                )}
                {att?.overridden && <span className="text-xs text-gray-400">✓ override</span>}
                {att?.status === "gps_fail" && (
                  <span className="text-xs text-gray-400">{att.distance_m}m</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Close modal */}
      {showCloseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card max-w-sm w-full space-y-4">
            <h3 className="font-semibold text-gray-900">ยืนยันปิดคาบ?</h3>
            <p className="text-sm text-gray-600">นักศึกษาที่ยังไม่เช็คชื่อจะถูกบันทึกว่า "ขาด" อัตโนมัติ</p>
            <div className="flex gap-3">
              <button onClick={() => setShowCloseModal(false)} className="btn-outline flex-1">ยกเลิก</button>
              <button onClick={handleClose} disabled={closing} className="btn-danger flex-1 flex items-center justify-center gap-2">
                {closing && <Spinner className="h-4 w-4" />}
                ปิดคาบ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: "gray" | "success" | "danger" | "warning" }) {
  const styles = {
    gray: "bg-gray-50 text-gray-700",
    success: "bg-[#EAF3DE] text-[#3B6D11]",
    danger: "bg-[#FCEBEB] text-[#A32D2D]",
    warning: "bg-[#FAEEDA] text-[#854F0B]",
  };
  return (
    <div className={`rounded-xl p-3 text-center ${styles[color]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs mt-0.5">{label}</p>
    </div>
  );
}
