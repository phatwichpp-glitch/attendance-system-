"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Spinner from "@/components/Spinner";
import { IconTablet, IconScreen } from "@/components/icons";
import { Session, StudentWithAttendance } from "@/types";
import { getPeriodLabel } from "@/lib/period-utils";

type Mode = "projector" | "ipad";

interface Data {
  session: Session;
  students: StudentWithAttendance[];
  spreadsheetId: string;
}

const MODE_KEY = "projector_mode";

export default function ProjectorClient({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrUrl, setQrUrl] = useState("");
  const [qrUrlHD, setQrUrlHD] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);
  const [mode, setMode] = useState<Mode>("projector");
  const listRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  // Load saved mode
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(MODE_KEY);
    if (stored === "ipad" || stored === "projector") setMode(stored as Mode);
  }, []);

  const toggleMode = () => {
    const next: Mode = mode === "projector" ? "ipad" : "projector";
    setMode(next);
    if (typeof window !== "undefined") localStorage.setItem(MODE_KEY, next);
  };

  // Wake lock — keep screen on
  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let lock: any = null;
    const acquire = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lock = await (navigator as any).wakeLock?.request?.("screen");
      } catch {}
    };
    acquire();
    // Re-acquire when page becomes visible again
    const onVisible = () => { if (document.visibilityState === "visible") acquire(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release?.().catch(() => {});
    };
  }, []);

  const generateQR = useCallback(async (url: string, size: number): Promise<string> => {
    const QRCode = (await import("qrcode")).default;
    return QRCode.toDataURL(url, {
      width: size,
      margin: 2,
      color: { dark: "#ffffff", light: "#0a0a0a" },
    });
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/sheets/session/${sessionId}`);
      if (!res.ok) return;
      const d: Data = await res.json();

      // Auto-scroll list to top when new attendee arrives
      const newCount = d.students.filter((s) => s.attendance).length;
      if (newCount > prevCountRef.current && listRef.current) {
        listRef.current.scrollTop = 0;
      }
      prevCountRef.current = newCount;

      setData(d);
      setLoading(false);

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const checkUrl = `${origin}/check?s=${sessionId}&o=${d.session.otp}&sid=${d.spreadsheetId}`;

      const [small, hd] = await Promise.all([
        generateQR(checkUrl, 280),
        generateQR(checkUrl, 1160),
      ]);
      setQrUrl(small);
      setQrUrlHD(hd);
    } catch {}
  }, [sessionId, generateQR]);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 5000);
    return () => clearInterval(t);
  }, [fetchData]);

  // Countdown
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0a0a0a" }}>
        <Spinner className="h-12 w-12 text-white" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0a0a0a", color: "#6b7280" }}>
        Session not found
      </div>
    );
  }

  const { session: s, students } = data;
  const isClosed = !!s.closed_at;

  // Double period label helpers
  const periodDisplayLabel = s.period_count && s.period_count >= 2
    ? getPeriodLabel(parseInt(s.period), s.period_end)
    : `Period ${s.period}`;
  const partIndicator = s.part_number === 1 ? " ①" : s.part_number === 2 ? " ②" : "";
  const isExpired = !isClosed && timeLeft === 0 && s.otp_expire_min > 0;
  const present = students.filter((x) => ["present", "late"].includes(x.attendance?.status ?? "")).length;
  const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const ss = String(timeLeft % 60).padStart(2, "0");
  const expirePct = s.otp_expire_min > 0 ? ((timeLeft / (s.otp_expire_min * 60)) * 100).toFixed(1) : "0";

  // Checked-in list: newest first, only present/late
  const checkedIn = students
    .filter((x) => x.attendance && ["present", "late"].includes(x.attendance.status))
    .sort((a, b) => new Date(b.attendance!.checked_at).getTime() - new Date(a.attendance!.checked_at).getTime());

  // Shared mode toggle button
  const ModeToggle = (
    <button
      onClick={toggleMode}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        backgroundColor: "rgba(255,255,255,0.07)",
        color: "#9ca3af",
        border: "0.5px solid rgba(255,255,255,0.12)",
        borderRadius: 8,
        padding: "6px 12px",
        fontSize: 12,
        cursor: "pointer",
        minHeight: 44,
        minWidth: 44,
      }}
    >
      {mode === "projector"
        ? <><IconTablet size={13} /> iPad Mode</>
        : <><IconScreen size={13} /> Projector Mode</>
      }
    </button>
  );

  // ── Closed / Expired overlay ───────────────────────────────────────────────
  if (isClosed || isExpired) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-4"
        style={{ backgroundColor: "#0a0a0a", color: "white" }}
      >
        <p className="text-5xl text-gray-500">{isClosed ? "Session Closed" : "OTP Expired"}</p>
        <p style={{ color: "#6b7280" }}>{s.course_id} · Section {s.section} · {periodDisplayLabel}{partIndicator}</p>
        <p style={{ fontFamily: "ui-monospace, monospace", fontSize: "2.5rem", fontWeight: 700 }}>
          {present}<span style={{ color: "#6b7280" }}>/{students.length}</span>
          <span className="text-xl text-gray-500 ml-2">students</span>
        </p>
      </div>
    );
  }

  // ── iPad Mode ──────────────────────────────────────────────────────────────
  if (mode === "ipad") {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#0a0a0a", color: "white" }}>
        {/* Top-right student count */}
        <div
          className="absolute top-4 right-4 z-10"
          style={{ fontFamily: "ui-monospace, monospace", fontSize: 14, color: "#6b7280" }}
        >
          {present}/{students.length}
        </div>

        {/* Centered content */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 py-16">
          {/* QR — displayed at 580px, generated at 1160px for crispness */}
          {qrUrlHD ? (
            <img
              src={qrUrlHD}
              alt="Check-in QR Code"
              width={580}
              height={580}
              className="rounded-2xl"
              style={{ imageRendering: "crisp-edges" }}
            />
          ) : (
            <div
              className="rounded-2xl flex items-center justify-center"
              style={{ width: 580, height: 580, backgroundColor: "#111" }}
            >
              <Spinner className="h-12 w-12 text-gray-600" />
            </div>
          )}

          {/* OTP below QR */}
          <p
            className="mt-8"
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: 28,
              color: "#6b7280",
              letterSpacing: "0.2em",
            }}
          >
            {s.otp}
          </p>

          {/* Countdown bar */}
          <div className="w-full max-w-[580px] mt-4 space-y-1">
            <div className="flex justify-between" style={{ fontSize: 12, color: "#4b5563" }}>
              <span>OTP expires in</span>
              <span
                style={{
                  fontFamily: "ui-monospace, monospace",
                  color: timeLeft < 60 ? "#ef4444" : "#6b7280",
                }}
              >
                {mm}:{ss}
              </span>
            </div>
            <div className="h-1 rounded-full" style={{ backgroundColor: "#1f2937" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${expirePct}%`, backgroundColor: timeLeft < 60 ? "#ef4444" : "#22c55e" }}
              />
            </div>
          </div>
        </div>

        {/* Bottom fixed strip */}
        <div
          className="flex items-center justify-between px-6"
          style={{ height: 48, borderTop: "0.5px solid #1f2937", flexShrink: 0 }}
        >
          <p style={{ color: "#6b7280", fontSize: 12 }}>
            {s.course_id} · {periodDisplayLabel}{partIndicator} · Section {s.section}
          </p>
          {ModeToggle}
        </div>
      </div>
    );
  }

  // ── Projector Mode ─────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: "#0a0a0a", color: "white" }}
    >
      {/* Top-right mode toggle */}
      <div className="absolute top-4 right-4 z-10">{ModeToggle}</div>

      {/* TOP ~60% */}
      <div className="flex-[6] flex flex-col items-center justify-center px-16 pt-8 pb-4">
        <p className="text-gray-400 text-base mb-8 text-center">
          {s.course_id} · Section {s.section} · {periodDisplayLabel}{partIndicator} · {s.date}
        </p>

        <div className="flex items-center gap-20 mb-8">
          {/* OTP + countdown */}
          <div className="text-center space-y-4">
            <p className="text-gray-500 text-sm uppercase tracking-widest">OTP Code</p>
            <p
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: "4.5rem",
                fontWeight: 700,
                letterSpacing: "0.3em",
                lineHeight: 1,
              }}
            >
              {s.otp}
            </p>
            <div className="space-y-2">
              <p
                style={{
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "2.5rem",
                  fontWeight: 700,
                  color: timeLeft < 60 ? "#ef4444" : "#e5e7eb",
                }}
              >
                {mm}:{ss}
              </p>
              <div className="h-2 rounded-full w-64 mx-auto" style={{ backgroundColor: "#1f2937" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${expirePct}%`,
                    backgroundColor: timeLeft < 60 ? "#ef4444" : "#22c55e",
                  }}
                />
              </div>
            </div>
          </div>

          {/* QR */}
          {qrUrl && (
            <div className="text-center space-y-3">
              <p className="text-gray-400 text-sm">Scan to check in</p>
              <img src={qrUrl} alt="QR Code" className="w-[280px] h-[280px] rounded-xl mx-auto" />
            </div>
          )}
        </div>

        {/* Student count */}
        <div className="text-center">
          <p className="text-gray-500 text-sm mb-1">Checked In</p>
          <p style={{ fontSize: "3rem", fontWeight: 700, lineHeight: 1 }}>
            <span>{present}</span>
            <span style={{ color: "#6b7280" }}>/{students.length}</span>
            <span className="text-xl text-gray-500 ml-2">students</span>
          </p>
        </div>
      </div>

      {/* BOTTOM ~40% */}
      <div className="flex-[4] flex flex-col" style={{ borderTop: "0.5px solid #222" }}>
        <div className="px-8 py-3 flex items-center gap-3 flex-shrink-0">
          <span className="text-sm font-medium text-gray-300">Checked In</span>
          <span
            className="rounded-full px-2 py-0.5 text-xs"
            style={{ backgroundColor: "#1f2937", color: "#9ca3af" }}
          >
            {checkedIn.length}
          </span>
        </div>

        {checkedIn.length === 0 ? (
          <div className="flex-1 flex items-center justify-center" style={{ color: "#4b5563" }}>
            รอนักศึกษาเช็คชื่อ...
          </div>
        ) : (
          <div ref={listRef} className="flex-1 overflow-y-auto px-8 pb-4 projector-list">
            {checkedIn.map((x) => (
              <div
                key={x.student_id}
                className="projector-entry flex items-center gap-4 py-2"
                style={{ borderBottom: "0.5px solid #111" }}
              >
                <span
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    color: "#374151",
                    fontSize: 12,
                    width: 28,
                    textAlign: "right",
                    flexShrink: 0,
                  }}
                >
                  {x.order_num}
                </span>
                <span style={{ flex: 1, fontSize: 14, color: "white" }}>
                  {x.firstname} {x.lastname}
                </span>
                <span
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    color: "#6b7280",
                    fontSize: 12,
                    flexShrink: 0,
                  }}
                >
                  {new Date(x.attendance!.checked_at).toLocaleTimeString("th-TH", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    padding: "2px 8px",
                    borderRadius: 20,
                    flexShrink: 0,
                    backgroundColor: x.attendance!.status === "late" ? "#3d2e00" : "#1a3d1a",
                    color: x.attendance!.status === "late" ? "#EF9F27" : "#3fb950",
                  }}
                >
                  {x.attendance!.status === "late" ? "Late" : "Present"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
