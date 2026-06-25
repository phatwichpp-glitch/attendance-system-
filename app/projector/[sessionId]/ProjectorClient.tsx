"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Session, StudentAttendance } from "@/lib/types";
import Spinner from "@/components/Spinner";

interface SessionData {
  session: Session;
  students: StudentAttendance[];
  spreadsheetId: string;
}

export default function ProjectorClient({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/sheets/session/${sessionId}`);
      if (!res.ok) return;
      const d: SessionData = await res.json();
      setData(d);
      setLoading(false);

      // Generate QR code
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const checkUrl = `${origin}/check?s=${sessionId}&o=${d.session.otp}&sid=${d.spreadsheetId}`;
      const QRCode = (await import("qrcode")).default;
      const url = await QRCode.toDataURL(checkUrl, {
        width: 320,
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
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    if (!data) return;
    const updateCountdown = () => {
      const opened = new Date(data.session.opened_at).getTime();
      const expiry = opened + data.session.otp_expire_min * 60 * 1000;
      const remaining = Math.max(0, Math.floor((expiry - Date.now()) / 1000));
      setTimeLeft(remaining);
    };
    updateCountdown();
    const t = setInterval(updateCountdown, 1000);
    return () => clearInterval(t);
  }, [data]);

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <Spinner className="h-12 w-12 text-white" />
    </div>
  );

  if (!data) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-white">ไม่พบข้อมูลคาบ</div>
  );

  const { session, students } = data;
  const isClosed = !!session.closed_at;
  const isExpired = timeLeft === 0;
  const present = students.filter((s) => ["present", "late"].includes(s.attendance?.status ?? "")).length;
  const total = students.length;

  const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const ss = String(timeLeft % 60).padStart(2, "0");

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-8 select-none">
      <div className="w-full max-w-3xl space-y-8">
        {/* Course info */}
        <div className="text-center">
          <p className="text-gray-400 text-lg">{session.course_id} · Section {session.section} · คาบ {session.period}</p>
          <p className="text-gray-500 text-sm mt-1">{session.date}</p>
        </div>

        {(isClosed || isExpired) ? (
          <div className="text-center space-y-4">
            <p className="text-4xl text-gray-500">{isClosed ? "ปิดคาบแล้ว" : "OTP หมดอายุ"}</p>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row items-center justify-center gap-12">
            {/* OTP */}
            <div className="text-center space-y-4">
              <p className="text-gray-400 text-sm uppercase tracking-widest">OTP</p>
              <p className="font-mono text-8xl font-bold tracking-[0.3em] text-white">{session.otp}</p>
              <div className="text-center">
                <p className="text-gray-400 text-sm">หมดอายุใน</p>
                <p className={`font-mono text-4xl font-bold ${timeLeft < 60 ? "text-red-400" : "text-gray-200"}`}>
                  {mm}:{ss}
                </p>
              </div>
            </div>

            {/* QR Code */}
            {qrDataUrl && (
              <div className="text-center space-y-3">
                <p className="text-gray-400 text-sm">สแกน QR เพื่อเช็คชื่อ</p>
                <img src={qrDataUrl} alt="QR Code" className="w-48 h-48 mx-auto rounded-lg" />
              </div>
            )}
          </div>
        )}

        {/* Attendance count */}
        <div className="text-center">
          <p className="text-gray-400 text-sm mb-1">เช็คชื่อแล้ว</p>
          <p className="text-5xl font-bold">
            <span className="text-white">{present}</span>
            <span className="text-gray-600">/{total}</span>
            <span className="text-gray-400 text-2xl ml-2">คน</span>
          </p>
        </div>

        {/* Student mini list */}
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 max-h-40 overflow-y-auto">
          {students
            .filter((s) => s.attendance)
            .map((s) => (
              <div key={s.student_id} className={`text-center px-2 py-1.5 rounded-lg text-xs ${
                s.attendance?.status === "gps_fail" ? "bg-yellow-900/50 text-yellow-300" : "bg-green-900/50 text-green-300"
              }`}>
                <p className="font-mono">{s.student_id.slice(-4)}</p>
                <p className="truncate">{s.firstname}</p>
              </div>
            ))}
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
