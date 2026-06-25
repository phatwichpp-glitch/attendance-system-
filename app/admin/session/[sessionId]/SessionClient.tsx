"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Spinner from "@/components/Spinner";
import { Session, StudentWithAttendance } from "@/types";

interface Data {
  session: Session;
  students: StudentWithAttendance[];
  spreadsheetId: string;
}

export default function SessionClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showClose, setShowClose] = useState(false);
  const [closing, setClosing] = useState(false);
  const [overriding, setOverriding] = useState<string | null>(null);

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
        s.attendance?.checked_at
          ? new Date(s.attendance.checked_at).toLocaleTimeString("th-TH")
          : "",
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
    <div className="card text-center py-10" style={{ color: "#A32D2D" }}>ไม่พบข้อมูลคาบ</div>
  );

  const { session: s, students, spreadsheetId } = data;
  const isClosed = !!s.closed_at;
  const present = students.filter((x) => ["present", "late"].includes(x.attendance?.status ?? "")).length;
  const absent  = students.filter((x) => x.attendance?.status === "absent").length;
  const gpsFail = students.filter((x) => x.attendance?.status === "gps_fail").length;
  const total   = students.length;
  const checkUrl = `/check?s=${sessionId}&o=${s.otp}&sid=${spreadsheetId}`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900">{s.course_id} — คาบ {s.period}</h1>
          <p className="text-sm text-gray-500">{s.date} · Section {s.section}</p>
          {lastUpdated && (
            <p className="text-xs text-gray-400 mt-0.5">
              อัปเดต {lastUpdated.toLocaleTimeString("th-TH")}
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {!isClosed && (
            <>
              <Link
                href={`/projector/${sessionId}`}
                target="_blank"
                className="btn-outline text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                ฉายบน Projector
              </Link>
              <button onClick={() => setShowClose(true)} className="btn-danger text-sm">ปิดคาบ</button>
            </>
          )}
          {isClosed && <span className="badge-absent px-3 py-2 text-sm">ปิดคาบแล้ว</span>}
          <button onClick={exportCsv} className="btn-outline text-sm">Export CSV</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Stat label="ทั้งหมด" value={total} bg="#f3f4f6" color="#374151" />
        <Stat label="มา/สาย" value={present} bg="#EAF3DE" color="#3B6D11" />
        <Stat label="ขาด" value={absent} bg="#FCEBEB" color="#A32D2D" />
        <Stat label="GPS fail" value={gpsFail} bg="#FAEEDA" color="#854F0B" />
      </div>

      {/* OTP banner */}
      {!isClosed && (
        <div className="card flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">OTP (หมดอายุใน {s.otp_expire_min} นาที)</p>
            <p
              className="text-4xl font-bold tracking-widest"
              style={{ fontFamily: "monospace", color: "#185FA5" }}
            >
              {s.otp}
            </p>
          </div>
          <div className="text-right text-xs text-gray-400 space-y-1">
            <p>รัศมี {s.radius_m} m</p>
            <p>สาย &gt;{s.late_after_min} นาที</p>
          </div>
        </div>
      )}

      {/* Progress */}
      <div className="card">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>เช็คชื่อแล้ว</span>
          <span className="font-medium">{present}/{total} คน</span>
        </div>
        <div className="h-2 rounded-full" style={{ backgroundColor: "#e5e7eb" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: total > 0 ? `${(present / total) * 100}%` : "0%", backgroundColor: "#3B6D11" }}
          />
        </div>
      </div>

      {/* Student list */}
      <div className="card overflow-hidden">
        <h2 className="font-semibold text-gray-900 mb-3">รายชื่อนักศึกษา</h2>
        <div className="divide-y divide-gray-50">
          {students.map((stu) => {
            const att = stu.attendance;
            return (
              <div key={stu.student_id} className="py-2.5 flex items-center gap-3 text-sm">
                <span className="text-gray-300 text-xs w-5 text-right">{stu.order_num}</span>
                <span className="font-mono text-xs text-gray-400 w-24">{stu.student_id}</span>
                <span className="flex-1 min-w-0 truncate">{stu.firstname} {stu.lastname}</span>
                {att ? (
                  <>
                    <span className={
                      att.status === "present" ? "badge-present" :
                      att.status === "late"    ? "badge-late" :
                      att.status === "absent"  ? "badge-absent" : "badge-gps"
                    }>
                      {att.status === "present" ? "มาแล้ว" :
                       att.status === "late"    ? "สาย" :
                       att.status === "absent"  ? "ขาด" : "GPS fail"}
                    </span>
                    {att.status === "gps_fail" && (
                      <span className="text-xs text-gray-400">{att.distance_m}m</span>
                    )}
                    {att.status === "gps_fail" && !att.overridden && !isClosed && (
                      <button
                        onClick={() => handleOverride(att.attendance_id)}
                        disabled={overriding === att.attendance_id}
                        className="btn-outline text-xs px-2 py-1"
                      >
                        {overriding === att.attendance_id
                          ? <Spinner className="h-3 w-3" />
                          : "อนุมัติ"
                        }
                      </button>
                    )}
                    {att.overridden && <span className="text-xs text-gray-400">✓</span>}
                  </>
                ) : (
                  <span className="badge-waiting">รอ</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Close modal */}
      {showClose && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="card max-w-sm w-full space-y-4">
            <h3 className="font-semibold text-gray-900">ยืนยันปิดคาบ?</h3>
            <p className="text-sm text-gray-600">
              นักศึกษาที่ยังไม่เช็คชื่อ <strong>{total - present - gpsFail} คน</strong> จะถูกบันทึกเป็น &quot;ขาด&quot; อัตโนมัติ
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowClose(false)} className="btn-outline flex-1">ยกเลิก</button>
              <button
                onClick={handleClose}
                disabled={closing}
                className="btn-danger flex-1 flex items-center justify-center gap-2"
              >
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

function Stat({ label, value, bg, color }: { label: string; value: number; bg: string; color: string }) {
  return (
    <div className="rounded-xl p-3 text-center" style={{ backgroundColor: bg }}>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="text-xs mt-0.5" style={{ color }}>{label}</p>
    </div>
  );
}
