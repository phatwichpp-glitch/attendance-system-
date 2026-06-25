"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Spinner from "@/components/Spinner";

type CheckState =
  | "loading_gps"
  | "ready"
  | "submitting"
  | "success"
  | "gps_fail"
  | "duplicate_ok"
  | "duplicate_gps_fail"
  | "expired"
  | "not_found"
  | "error";

interface Result {
  status?: string;
  student?: { firstname: string; lastname: string };
  distance_m?: number;
  duplicate?: boolean;
}

const RETRY_DELAYS = [1000, 2000, 4000];

export default function CheckClient() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("s") ?? "";
  const otp = searchParams.get("o") ?? "";
  const spreadsheetId = searchParams.get("sid") ?? "";

  const [state, setState] = useState<CheckState>("loading_gps");
  const [studentId, setStudentId] = useState("");
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setState("ready");
      },
      (err) => {
        setGpsError(err.message);
        setGps(null);
        setState("ready");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, []);

  useEffect(() => {
    if (state === "ready") {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [state]);

  const fetchWithRetry = useCallback(async (body: object, retryCount = 0): Promise<Response> => {
    try {
      return await fetch("/api/sheets/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      if (retryCount < RETRY_DELAYS.length) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[retryCount]));
        return fetchWithRetry(body, retryCount + 1);
      }
      throw new Error("เครือข่ายขัดข้อง");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{9}$/.test(studentId)) return;
    setState("submitting");

    try {
      const res = await fetchWithRetry({
        session_id: sessionId,
        otp,
        student_id: studentId,
        lat: gps?.lat ?? null,
        lng: gps?.lng ?? null,
        spreadsheet_id: spreadsheetId,
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "expired") { setState("expired"); return; }
        if (data.error === "not_found") { setState("not_found"); return; }
        setState("error");
        return;
      }

      setResult(data);

      if (data.duplicate) {
        setState(data.status === "gps_fail" ? "duplicate_gps_fail" : "duplicate_ok");
      } else if (data.status === "gps_fail") {
        setState("gps_fail");
      } else {
        setState("success");
        if (navigator.vibrate) navigator.vibrate(200);
      }

      // Start countdown for success states
      if (["success", "duplicate_ok"].includes(data.duplicate ? "duplicate_ok" : data.status === "gps_fail" ? "gps_fail" : "success")) {
        let c = 5;
        setCountdown(c);
        const t = setInterval(() => {
          c--;
          setCountdown(c);
          if (c <= 0) clearInterval(t);
        }, 1000);
      }
    } catch (e: unknown) {
      setState("error");
    }
  };

  const reset = () => {
    setStudentId("");
    setResult(null);
    setCountdown(null);
    setState(gps ? "ready" : "ready");
  };

  if (!sessionId || !otp || !spreadsheetId) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card max-w-sm w-full text-center py-10">
        <p className="text-[#A32D2D]">ลิงก์ไม่ถูกต้อง กรุณาใช้ลิงก์จาก QR code</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="card w-full max-w-sm space-y-6 py-8">
        <div className="text-center">
          <div className="w-12 h-12 bg-[#185FA5] rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">เช็คชื่อเข้าเรียน</h1>
        </div>

        {state === "loading_gps" && (
          <div className="text-center space-y-3">
            <Spinner className="h-8 w-8 text-[#185FA5] mx-auto" />
            <p className="text-sm text-gray-500">กำลังรับตำแหน่ง GPS...</p>
          </div>
        )}

        {state === "ready" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {gpsError && (
              <div className="bg-[#FAEEDA] text-[#854F0B] rounded-lg px-3 py-2 text-xs">
                GPS ไม่สามารถใช้งานได้ การเช็คชื่ออาจไม่ผ่าน
              </div>
            )}
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
                className="input text-center text-2xl font-mono tracking-widest py-4"
                autoComplete="off"
              />
              <p className="text-xs text-gray-400 text-center mt-1">{studentId.length}/9 หลัก</p>
            </div>
            <button
              type="submit"
              disabled={studentId.length !== 9}
              className="btn-primary w-full py-3 text-base"
            >
              เช็คชื่อ
            </button>
          </form>
        )}

        {state === "submitting" && (
          <div className="text-center space-y-3">
            <Spinner className="h-8 w-8 text-[#185FA5] mx-auto" />
            <p className="text-sm text-gray-500">กำลังบันทึก...</p>
          </div>
        )}

        {state === "success" && (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-[#EAF3DE] rounded-full flex items-center justify-center mx-auto">
              <svg className="w-9 h-9 text-[#3B6D11]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-lg text-[#3B6D11]">เช็คชื่อสำเร็จ!</p>
              {result?.student && <p className="text-gray-600 mt-1">{result.student.firstname} {result.student.lastname}</p>}
              <p className="text-xs text-gray-400 mt-2">
                {result?.status === "late" ? "⚠ บันทึกว่า สาย" : "✓ บันทึกว่า มา"}
              </p>
            </div>
            {countdown !== null && countdown > 0 && (
              <p className="text-xs text-gray-400">ปิดอัตโนมัติใน {countdown}s</p>
            )}
          </div>
        )}

        {state === "gps_fail" && (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-[#FAEEDA] rounded-full flex items-center justify-center mx-auto">
              <svg className="w-9 h-9 text-[#854F0B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-lg text-[#854F0B]">GPS ไม่ผ่าน</p>
              {result?.student && <p className="text-gray-600 mt-1">{result.student.firstname} {result.student.lastname}</p>}
              <p className="text-sm text-gray-500 mt-1">ระยะทาง {result?.distance_m}m จากห้องเรียน</p>
              <p className="text-xs text-gray-400 mt-2">กรุณาแจ้งอาจารย์เพื่อขออนุมัติ</p>
            </div>
          </div>
        )}

        {(state === "duplicate_ok" || state === "duplicate_gps_fail") && (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-9 h-9 text-[#185FA5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-lg text-[#185FA5]">เช็คชื่อแล้ว</p>
              {result?.student && <p className="text-gray-600 mt-1">{result.student.firstname} {result.student.lastname}</p>}
              <p className="text-xs text-gray-400 mt-2">รหัสนี้ได้เช็คชื่อในคาบนี้แล้ว</p>
            </div>
          </div>
        )}

        {state === "expired" && (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-[#FCEBEB] rounded-full flex items-center justify-center mx-auto">
              <svg className="w-9 h-9 text-[#A32D2D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-lg text-[#A32D2D]">OTP หมดอายุ</p>
              <p className="text-sm text-gray-500 mt-1">คาบนี้ปิดการเช็คชื่อแล้ว</p>
            </div>
          </div>
        )}

        {state === "not_found" && (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-[#FCEBEB] rounded-full flex items-center justify-center mx-auto">
              <svg className="w-9 h-9 text-[#A32D2D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-lg text-[#A32D2D]">ไม่พบรหัสนักศึกษา</p>
              <p className="text-sm text-gray-500 mt-1 font-mono">{studentId}</p>
            </div>
            <button onClick={reset} className="btn-outline w-full">ลองใหม่</button>
          </div>
        )}

        {state === "error" && (
          <div className="text-center space-y-4">
            <p className="text-[#A32D2D]">เกิดข้อผิดพลาด กรุณาลองใหม่</p>
            <button onClick={reset} className="btn-outline w-full">ลองใหม่</button>
          </div>
        )}
      </div>
    </div>
  );
}
