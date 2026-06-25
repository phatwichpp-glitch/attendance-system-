"use client";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Spinner from "@/components/Spinner";
import { CheckInState } from "@/types";

function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(16);
}

function getOrCreateFingerprint(): string {
  if (typeof window === "undefined") return "";
  try {
    const KEY = "device_fp";
    const stored = localStorage.getItem(KEY);
    if (stored) return stored;
    const raw = [
      navigator.userAgent,
      navigator.language,
      `${screen.width}x${screen.height}x${screen.colorDepth}`,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      String(navigator.hardwareConcurrency),
      navigator.platform,
    ].join("|");
    const fp = djb2(raw);
    localStorage.setItem(KEY, fp);
    return fp;
  } catch {
    return "";
  }
}

interface Result {
  status?: string;
  original_status?: string;
  student?: { firstname: string; lastname: string };
  checked_at?: string;
  distance_m?: number;
  gps_pass?: boolean;
  duplicate?: boolean;
}

const RETRY_DELAYS = [1000, 2000, 4000];

async function fetchCheckin(body: object, retries = 3): Promise<Response> {
  try {
    return await fetch("/api/sheets/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (retries > 1) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[3 - retries]));
      return fetchCheckin(body, retries - 1);
    }
    throw e;
  }
}

export default function CheckClient() {
  const sp = useSearchParams();
  const sessionId = sp.get("s") ?? "";
  const otp = sp.get("o") ?? "";
  const spreadsheetId = sp.get("sid") ?? "";

  const [state, setState] = useState<CheckInState>("loading");
  const [studentId, setStudentId] = useState("");
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsReady, setGpsReady] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fingerprintRef = useRef<string>("");

  useEffect(() => {
    fingerprintRef.current = getOrCreateFingerprint();
  }, []);

  useEffect(() => {
    if (!sessionId || !otp) {
      setState("session_invalid");
      return;
    }

    // Request GPS
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsReady(true);
      },
      () => setGpsReady(true),
      { enableHighAccuracy: true, timeout: 15000 }
    );

    // Pre-check session
    fetchCheckin({ session_id: sessionId, otp, spreadsheet_id: spreadsheetId })
      .then((r) => r.json())
      .then((d) => {
        if (d.error === "session_expired") setState("session_expired");
        else if (d.valid) setState("ready");
        else setState("session_invalid");
      })
      .catch(() => setState("session_invalid"));
  }, [sessionId, otp, spreadsheetId]);

  useEffect(() => {
    if (state === "ready") setTimeout(() => inputRef.current?.focus(), 100);
  }, [state]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{9}$/.test(studentId)) return;
    setState("submitting");

    try {
      const res = await fetchCheckin({
        session_id: sessionId,
        otp,
        student_id: studentId,
        lat: gps?.lat ?? null,
        lng: gps?.lng ?? null,
        spreadsheet_id: spreadsheetId,
        device_fingerprint: fingerprintRef.current,
      });
      const data: Result & { error?: string } = await res.json();

      if (!res.ok) {
        if (data.error === "session_expired") { setState("session_expired"); return; }
        if (data.error === "not_found") { setState("not_found"); return; }
        setState("error"); return;
      }

      setResult(data);

      if (data.duplicate) {
        setState(data.original_status === "gps_fail" ? "already_gps_fail" : "already_present");
        return;
      }

      if (data.status === "gps_fail") {
        setState("gps_fail");
        return;
      }

      const finalState: CheckInState = data.status === "late" ? "success_late" : "success_present";
      setState(finalState);
      if (navigator.vibrate) navigator.vibrate(200);
    } catch {
      setState("error");
    }
  };

  const reset = () => { setStudentId(""); setResult(null); setState(gps || gpsReady ? "ready" : "loading"); };

  if (!sessionId || !otp) {
    return <Screen bg="#FCEBEB"><p className="text-[#A32D2D] font-medium">ลิงก์ไม่ถูกต้อง</p></Screen>;
  }

  if (state === "loading") {
    return (
      <Screen>
        <Spinner className="h-8 w-8 text-[#185FA5] mx-auto" />
        <p className="text-gray-500 text-sm text-center mt-3">กำลังตรวจสอบ...</p>
      </Screen>
    );
  }

  if (state === "session_invalid") {
    return (
      <Screen bg="#FCEBEB">
        <Icon color="#A32D2D" bg="#FCEBEB">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </Icon>
        <p className="font-bold text-lg text-[#A32D2D]">ไม่พบคาบเรียน</p>
        <p className="text-sm text-gray-500">QR code อาจหมดอายุหรือไม่ถูกต้อง</p>
      </Screen>
    );
  }

  if (state === "session_expired") {
    return (
      <Screen>
        <Icon color="#854F0B" bg="#FAEEDA">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </Icon>
        <p className="font-bold text-lg text-[#854F0B]">OTP หมดอายุ</p>
        <p className="text-sm text-gray-500">คาบนี้ปิดการเช็คชื่อแล้ว</p>
      </Screen>
    );
  }

  if (state === "ready") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="card w-full max-w-sm space-y-6 py-8">
          <div className="text-center">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: "#185FA5" }}>
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900">เช็คชื่อเข้าเรียน</h1>
          </div>

          {!gpsReady && (
            <div className="flex items-center gap-2 text-xs justify-center" style={{ color: "#854F0B" }}>
              <Spinner className="h-3 w-3" /> กำลังรับ GPS...
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">รหัสนักศึกษา</label>
              <input
                ref={inputRef}
                type="tel"
                inputMode="numeric"
                pattern="\d{9}"
                maxLength={9}
                value={studentId}
                onChange={(e) => setStudentId(e.target.value.replace(/\D/g, "").slice(0, 9))}
                placeholder="000000000"
                className="input text-center py-4"
                style={{ fontSize: "1.5rem", fontFamily: "monospace", letterSpacing: "0.2em" }}
                autoComplete="off"
              />
              <p className="text-xs text-gray-400 text-center mt-1">{studentId.length}/9 หลัก</p>
            </div>

            <div className="flex items-center gap-1.5 text-xs justify-center" style={{ color: gps ? "#3B6D11" : "#854F0B" }}>
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: gps ? "#3B6D11" : "#854F0B" }} />
              {gps ? `GPS พร้อม` : "GPS ไม่พร้อม"}
            </div>

            <button type="submit" disabled={studentId.length !== 9} className="btn-primary w-full py-3 text-base">
              เช็คชื่อ
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (state === "submitting") {
    return <Screen><Spinner className="h-8 w-8 text-[#185FA5] mx-auto" /><p className="text-gray-500 text-sm text-center mt-3">กำลังบันทึก...</p></Screen>;
  }

  if (state === "success_present") {
    return (
      <Screen bg="#EAF3DE">
        <Icon color="#3B6D11" bg="#EAF3DE">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </Icon>
        <p className="font-bold text-xl text-[#3B6D11]">เช็คชื่อสำเร็จ!</p>
        {result?.student && <p className="text-gray-700">{result.student.firstname} {result.student.lastname}</p>}
        <p className="text-sm text-[#3B6D11]">✓ บันทึกว่า มา</p>
        {result?.distance_m !== undefined && <p className="text-xs text-gray-500">ระยะทาง {result.distance_m} m</p>}
      </Screen>
    );
  }

  if (state === "success_late") {
    return (
      <Screen bg="#E6F1FB">
        <Icon color="#185FA5" bg="#E6F1FB">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </Icon>
        <p className="font-bold text-xl text-[#185FA5]">เช็คชื่อสำเร็จ</p>
        {result?.student && <p className="text-gray-700">{result.student.firstname} {result.student.lastname}</p>}
        <p className="text-sm text-[#185FA5]">บันทึกเป็นสาย</p>
      </Screen>
    );
  }

  if (state === "gps_fail") {
    return (
      <Screen bg="#FAEEDA">
        <Icon color="#854F0B" bg="#FAEEDA">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </Icon>
        <p className="font-bold text-xl text-[#854F0B]">GPS ไม่ผ่าน</p>
        {result?.student && <p className="text-gray-700">{result.student.firstname} {result.student.lastname}</p>}
        <p className="text-sm" style={{ color: "#854F0B" }}>ระยะทาง {result?.distance_m} m จากห้องเรียน</p>
        <p className="text-xs text-gray-500">บันทึกแล้ว — แจ้งอาจารย์เพื่อขออนุมัติ</p>
      </Screen>
    );
  }

  if (state === "already_present") {
    return (
      <Screen bg="#E6F1FB">
        <Icon color="#185FA5" bg="#E6F1FB">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </Icon>
        <p className="font-bold text-xl text-[#185FA5]">เช็คชื่อแล้ว</p>
        {result?.student && <p className="text-gray-700">{result.student.firstname} {result.student.lastname}</p>}
        {result?.checked_at && <p className="text-xs text-gray-500">เวลา {new Date(result.checked_at).toLocaleTimeString("th-TH")}</p>}
      </Screen>
    );
  }

  if (state === "already_gps_fail") {
    return (
      <Screen bg="#FAEEDA">
        <Icon color="#854F0B" bg="#FAEEDA">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </Icon>
        <p className="font-bold text-xl text-[#854F0B]">เช็คชื่อแล้ว (GPS fail)</p>
        {result?.student && <p className="text-gray-700">{result.student.firstname} {result.student.lastname}</p>}
        <p className="text-xs text-gray-500">รออาจารย์อนุมัติ</p>
      </Screen>
    );
  }

  if (state === "not_found") {
    return (
      <Screen bg="#FCEBEB">
        <Icon color="#A32D2D" bg="#FCEBEB">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </Icon>
        <p className="font-bold text-xl text-[#A32D2D]">ไม่พบรหัสนักศึกษา</p>
        <p className="font-mono text-gray-600">{studentId}</p>
        <p className="text-sm text-gray-500">รหัสนี้ไม่อยู่ในรายชื่อวิชานี้</p>
        <button onClick={reset} className="btn-outline">ลองใหม่</button>
      </Screen>
    );
  }

  return (
    <Screen>
      <p className="text-[#A32D2D] font-medium">เกิดข้อผิดพลาด</p>
      <button onClick={reset} className="btn-outline">ลองใหม่</button>
    </Screen>
  );
}

function Screen({ children, bg = "white" }: { children: React.ReactNode; bg?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ backgroundColor: bg }}>
      <div className="space-y-4 text-center max-w-sm w-full">{children}</div>
    </div>
  );
}

function Icon({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return (
    <div
      className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
      style={{ backgroundColor: bg, border: `2px solid ${color}22` }}
    >
      <svg className="w-9 h-9" fill="none" stroke={color} viewBox="0 0 24 24">{children}</svg>
    </div>
  );
}
