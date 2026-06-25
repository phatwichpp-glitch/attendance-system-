"use client";
import { useState, useEffect, useCallback } from "react";
import Spinner from "@/components/Spinner";
import { Session, StudentWithAttendance } from "@/types";

interface Data {
  session: Session;
  students: StudentWithAttendance[];
  spreadsheetId: string;
}

export default function ProjectorClient({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/sheets/session/${sessionId}`);
      if (!res.ok) return;
      const d: Data = await res.json();
      setData(d);
      setLoading(false);

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const checkUrl = `${origin}/check?s=${sessionId}&o=${d.session.otp}&sid=${d.spreadsheetId}`;
      const QRCode = (await import("qrcode")).default;
      const url = await QRCode.toDataURL(checkUrl, {
        width: 280,
        margin: 2,
        color: { dark: "#ffffff", light: "#0a0a0a" },
      });
      setQrDataUrl(url);
    } catch {
      // ignore
    }
  }, [sessionId]);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 5000);
    return () => clearInterval(t);
  }, [fetchData]);

  useEffect(() => {
    if (!data) return;
    const tick = () => {
      const opened = new Date(data.session.opened_at).getTime();
      const expiry = opened + data.session.otp_expire_min * 60 * 1000;
      setTimeLeft(Math.max(0, Math.floor((expiry - Date.now()) / 1000)));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [data]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0a0a0a" }}>
      <Spinner className="h-12 w-12 text-white" />
    </div>
  );

  if (!data) return (
    <div className="min-h-screen flex items-center justify-center text-white" style={{ backgroundColor: "#0a0a0a" }}>
      ไม่พบข้อมูลคาบ
    </div>
  );

  const { session: s, students } = data;
  const isClosed = !!s.closed_at;
  const isExpired = timeLeft === 0;
  const present = students.filter((x) => ["present", "late"].includes(x.attendance?.status ?? "")).length;
  const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const ss = String(timeLeft % 60).padStart(2, "0");
  const expirePct = s.otp_expire_min > 0
    ? ((timeLeft / (s.otp_expire_min * 60)) * 100).toFixed(1)
    : "0";

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-8 select-none"
      style={{ backgroundColor: "#0a0a0a", color: "white" }}
    >
      {/* Course label */}
      <p className="text-gray-400 text-lg mb-8 text-center">
        {s.course_id} · Section {s.section} · คาบ {s.period} · {s.date}
      </p>

      {isClosed || isExpired ? (
        <p className="text-5xl text-gray-500 mb-8">
          {isClosed ? "ปิดคาบแล้ว" : "OTP หมดอายุ"}
        </p>
      ) : (
        <div className="flex flex-col lg:flex-row items-center gap-16 mb-8">
          {/* OTP + timer */}
          <div className="text-center space-y-4">
            <p className="text-gray-500 text-sm uppercase tracking-widest">รหัส OTP</p>
            <p
              className="font-bold tracking-[0.3em]"
              style={{ fontFamily: "monospace", fontSize: "5.5rem", lineHeight: 1 }}
            >
              {s.otp}
            </p>
            <div className="space-y-2">
              <p
                className="font-bold text-4xl"
                style={{ fontFamily: "monospace", color: timeLeft < 60 ? "#ef4444" : "#e5e7eb" }}
              >
                {mm}:{ss}
              </p>
              <div className="h-2 rounded-full w-64 mx-auto" style={{ backgroundColor: "#1f2937" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${expirePct}%`, backgroundColor: timeLeft < 60 ? "#ef4444" : "#3B6D11" }}
                />
              </div>
            </div>
          </div>

          {/* QR */}
          {qrDataUrl && (
            <div className="text-center space-y-3">
              <p className="text-gray-400 text-sm">สแกน QR เพื่อเช็คชื่อ</p>
              <img
                src={qrDataUrl}
                alt="QR Code"
                className="w-52 h-52 rounded-xl mx-auto"
              />
            </div>
          )}
        </div>
      )}

      {/* Attendance count */}
      <div className="text-center mb-6">
        <p className="text-gray-500 text-sm mb-1">เช็คชื่อแล้ว</p>
        <p style={{ fontSize: "3.5rem", fontWeight: 700, lineHeight: 1 }}>
          <span>{present}</span>
          <span style={{ color: "#6b7280" }}>/{students.length}</span>
          <span className="text-2xl text-gray-500 ml-2">คน</span>
        </p>
      </div>

      {/* Mini checked-in list */}
      {students.filter((x) => x.attendance).length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center max-w-2xl">
          {students
            .filter((x) => x.attendance)
            .map((x) => (
              <div
                key={x.student_id}
                className="text-center px-3 py-1.5 rounded-lg text-xs"
                style={{
                  backgroundColor:
                    x.attendance?.status === "gps_fail" ? "#451a03" : "#052e16",
                  color:
                    x.attendance?.status === "gps_fail" ? "#fde68a" : "#86efac",
                }}
              >
                <span style={{ fontFamily: "monospace" }}>{x.student_id.slice(-4)}</span>
                {" "}{x.firstname}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
