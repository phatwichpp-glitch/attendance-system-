"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Spinner from "@/components/Spinner";
import { Course, Settings, PERIODS, DEFAULT_SETTINGS } from "@/types";
import { loadSettings, saveSettings } from "@/lib/settings";

interface GpsState {
  lat: number;
  lng: number;
  accuracy: number;
  loading: boolean;
  error: string;
}

export default function SetupClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const initCourseId = sp.get("course_id") ?? "";
  const initSection = sp.get("section") ?? "";

  const [courses, setCourses] = useState<Course[]>([]);
  const [courseKey, setCourseKey] = useState(
    initCourseId && initSection ? `${initCourseId}__${initSection}` : ""
  );
  const [period, setPeriod] = useState("1");
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS });
  const [gps, setGps] = useState<GpsState>({
    lat: 0, lng: 0, accuracy: 0, loading: true, error: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [showGpsWarn, setShowGpsWarn] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(true);

  useEffect(() => {
    fetch("/api/sheets/courses")
      .then((r) => r.json())
      .then((d) => setCourses(d.courses ?? []))
      .finally(() => setLoadingCourses(false));
  }, []);

  const getCourse = useCallback(
    () => {
      const [cid, sec] = courseKey.split("__");
      return courses.find((c) => c.course_id === cid && c.section === sec) ?? null;
    },
    [courseKey, courses]
  );

  useEffect(() => {
    const c = getCourse();
    if (c) setSettings(loadSettings(c.course_id));
  }, [courseKey, getCourse]);

  const detectGps = useCallback(() => {
    setGps((g) => ({ ...g, loading: true, error: "" }));
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setGps({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          loading: false,
          error: "",
        }),
      (err) => setGps((g) => ({ ...g, loading: false, error: err.message })),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, []);

  useEffect(() => { detectGps(); }, [detectGps]);

  const handleSubmit = () => {
    if (settings.warn_low_accuracy && gps.accuracy > 100 && !gps.error) {
      setShowGpsWarn(true);
      return;
    }
    doOpen();
  };

  const doOpen = async () => {
    setShowGpsWarn(false);
    setSubmitting(true);
    const course = getCourse();
    if (!course) { setSubmitting(false); return; }

    saveSettings(course.course_id, settings);

    try {
      const res = await fetch("/api/sheets/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_id: course.course_id,
          section: course.section,
          period,
          lat: gps.lat,
          lng: gps.lng,
          ...settings,
        }),
      });
      if (!res.ok) throw new Error("เปิดคาบไม่สำเร็จ");
      const data = await res.json();
      router.push(`/admin/session/${data.session.session_id}`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      setSubmitting(false);
    }
  };

  const today = new Date().toLocaleDateString("th-TH", {
    year: "numeric", month: "long", day: "numeric",
  });

  const accWidth = Math.max(4, Math.min(100, (1 - gps.accuracy / 500) * 100));
  const accColor = gps.accuracy <= 20 ? "#3B6D11" : gps.accuracy <= 100 ? "#854F0B" : "#A32D2D";
  const course = getCourse();

  return (
    <div className="space-y-4">
      {/* Course & period */}
      <div className="card space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">รายวิชา</label>
          {loadingCourses ? (
            <div className="input flex items-center gap-2 text-gray-400">
              <Spinner className="h-4 w-4" /> กำลังโหลด...
            </div>
          ) : (
            <select className="input" value={courseKey} onChange={(e) => setCourseKey(e.target.value)}>
              <option value="">-- เลือกรายวิชา --</option>
              {courses.map((c) => (
                <option key={`${c.course_id}__${c.section}`} value={`${c.course_id}__${c.section}`}>
                  {c.course_id} · {c.title} · Sec.{c.section}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">คาบเรียน</label>
          <select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        {course && (
          <div className="rounded-lg p-3 text-xs grid grid-cols-2 gap-2" style={{ backgroundColor: "#f9fafb", border: "0.5px solid rgba(0,0,0,0.08)" }}>
            <span className="text-gray-500">รหัสวิชา: <strong className="font-mono text-gray-700">{course.course_id}</strong></span>
            <span className="text-gray-500">Section: <strong className="text-gray-700">{course.section}</strong></span>
            <span className="col-span-2 text-gray-500">วันที่: <strong className="text-gray-700">{today}</strong></span>
          </div>
        )}
      </div>

      {/* GPS */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-gray-900">ตำแหน่ง GPS</h3>
          <button onClick={detectGps} className="btn-outline text-xs px-3 py-1">อัปเดต</button>
        </div>
        {gps.loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Spinner className="h-4 w-4" /> กำลังหาตำแหน่ง...
          </div>
        ) : gps.error ? (
          <p className="text-sm" style={{ color: "#A32D2D" }}>ไม่สามารถรับ GPS: {gps.error}</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-mono text-gray-600">{gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}</p>
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>ความแม่นยำ</span>
                <span style={{ color: accColor }}>{Math.round(gps.accuracy)} m</span>
              </div>
              <div className="h-2 rounded-full" style={{ backgroundColor: "#e5e7eb" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${accWidth}%`, backgroundColor: accColor }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Settings */}
      <div className="card space-y-4">
        <h3 className="font-medium text-gray-900">การตั้งค่า</h3>
        <Slider label="รัศมี GPS" value={settings.radius_m} min={50} max={500} step={10} unit="m"
          onChange={(v) => setSettings((s) => ({ ...s, radius_m: v }))} />
        <Slider label="OTP หมดอายุ" value={settings.otp_expire_min} min={5} max={60} step={5} unit="นาที"
          onChange={(v) => setSettings((s) => ({ ...s, otp_expire_min: v }))} />
        <Slider label="นับว่าสาย หลังจาก" value={settings.late_after_min} min={5} max={30} step={5} unit="นาที"
          onChange={(v) => setSettings((s) => ({ ...s, late_after_min: v }))} />
        <div className="space-y-3 pt-3 border-t border-gray-100">
          <Toggle label="บันทึกเมื่อ GPS ล้มเหลว" checked={settings.save_gps_fail}
            onChange={(v) => setSettings((s) => ({ ...s, save_gps_fail: v }))} />
          <Toggle label="เตือนเมื่อ GPS ความแม่นยำต่ำ (>100m)" checked={settings.warn_low_accuracy}
            onChange={(v) => setSettings((s) => ({ ...s, warn_low_accuracy: v }))} />
          <Toggle label="แสดง countdown ให้นักศึกษา" checked={settings.show_countdown}
            onChange={(v) => setSettings((s) => ({ ...s, show_countdown: v }))} />
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting || !courseKey || gps.loading}
        className="btn-primary w-full py-3 text-base"
      >
        {submitting ? <><Spinner className="h-5 w-5" /> กำลังสร้าง...</> : "เปิดคาบและสร้าง OTP"}
      </button>

      {/* GPS warning modal */}
      {showGpsWarn && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="card max-w-sm w-full space-y-4">
            <h3 className="font-semibold text-gray-900">ความแม่นยำ GPS ต่ำ</h3>
            <p className="text-sm text-gray-600">
              GPS มีความแม่นยำ <strong>{Math.round(gps.accuracy)} m</strong> ซึ่งอาจทำให้นักศึกษาที่อยู่ในห้องเรียนเช็คชื่อไม่ผ่าน
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowGpsWarn(false)} className="btn-outline flex-1">รอสักครู่</button>
              <button onClick={doOpen} className="btn-primary flex-1">เปิดคาบต่อไป</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Slider({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <label className="text-gray-700">{label}</label>
        <span className="font-medium" style={{ color: "#185FA5" }}>{value} {unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full"
        style={{ accentColor: "#185FA5" }}
      />
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between cursor-pointer select-none">
      <span className="text-sm text-gray-700">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative w-10 h-6 rounded-full transition-colors flex-shrink-0"
        style={{ backgroundColor: checked ? "#185FA5" : "#d1d5db" }}
      >
        <span
          className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform"
          style={{ transform: checked ? "translateX(16px)" : "translateX(0)" }}
        />
      </button>
    </label>
  );
}
