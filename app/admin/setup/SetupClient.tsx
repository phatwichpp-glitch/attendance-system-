"use client";
import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import Spinner from "@/components/Spinner";
import { IconLocation, IconRefresh, IconWarning } from "@/components/icons";
import { Course, Settings, PERIODS, DEFAULT_SETTINGS, SemesterConfig } from "@/types";
import { loadSettings, saveSettings } from "@/lib/settings";
import { getWeekLabel } from "@/lib/week-utils";
import { getPeriodLabel, calcPeriodEnd } from "@/lib/period-utils";

const GpsMapPicker = dynamic(() => import("./GpsMapPicker"), {
  ssr: false,
  loading: () => <div className="h-64 rounded-lg" style={{ backgroundColor: "#f3f4f6" }} />,
});

interface GpsState {
  lat: number; lng: number; accuracy: number; loading: boolean; error: string;
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
  const [periodCount, setPeriodCount] = useState<1 | 2>(1);
  const [checkInMode, setCheckInMode] = useState<"single" | "double">("single");
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS });
  const [gps, setGps] = useState<GpsState>({ lat: 0, lng: 0, accuracy: 0, loading: true, error: "" });
  const [gpsSource, setGpsSource] = useState<"device" | "map">("device");
  const [submitting, setSubmitting] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [showGpsWarn, setShowGpsWarn] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [semesterConfig, setSemesterConfig] = useState<SemesterConfig | null>(null);

  // Week / date fields
  const todayIso = new Date().toISOString().split("T")[0];
  const [sessionDate, setSessionDate] = useState(todayIso);
  const [weekNumber, setWeekNumber] = useState<number | undefined>(undefined);
  const [weekLabel, setWeekLabel] = useState("");
  const [isPast, setIsPast] = useState(false);

  useEffect(() => {
    fetch("/api/sheets/courses")
      .then((r) => r.json())
      .then((d) => setCourses(d.courses ?? []))
      .finally(() => setLoadingCourses(false));
  }, []);

  const getCourse = useCallback(() => {
    const [cid, sec] = courseKey.split("__");
    return courses.find((c) => c.course_id === cid && c.section === sec) ?? null;
  }, [courseKey, courses]);

  // Fetch semester config when course changes
  useEffect(() => {
    const course = getCourse();
    if (!course) { setSemesterConfig(null); return; }

    setSettings(loadSettings(course.course_id));

    fetch(`/api/sheets/semester-config/${course.course_id}?section=${course.section}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d?.config) { setSemesterConfig(null); return; }
        const cfg: SemesterConfig = d.config;
        setSemesterConfig(cfg);
        // Auto-fill settings from config
        setSettings((s) => ({
          ...s,
          radius_m: cfg.default_gps_radius,
          otp_expire_min: cfg.default_otp_min,
          late_after_min: cfg.default_late_min,
        }));
        // Auto-fill period + double period from today's teaching day
        const todayDow = new Date().getDay();
        const todayEntry = cfg.teaching_schedule.find((t) => t.day === todayDow);
        if (todayEntry) {
          setPeriod(todayEntry.period);
          const pc = todayEntry.period_count ?? 1;
          setPeriodCount(pc >= 2 ? 2 : 1);
          if (pc >= 2) setCheckInMode(todayEntry.check_in_mode ?? "single");
        }
      })
      .catch(() => setSemesterConfig(null));
  }, [courseKey, getCourse]);

  // Auto-calculate week number/label when date or semester config changes
  useEffect(() => {
    if (!semesterConfig?.semester_start) { setWeekNumber(undefined); setWeekLabel(""); return; }
    const sessionD = new Date(sessionDate);
    const semStart = new Date(semesterConfig.semester_start);
    const days = semesterConfig.teaching_schedule.map((t) => t.day);
    const computed = getWeekLabel(sessionD, semStart, days, 0);
    setWeekNumber(computed.weekNumber);
    setWeekLabel(computed.label);
  }, [sessionDate, semesterConfig]);

  const detectGps = useCallback(() => {
    setGpsSource("device");
    setGps((g) => ({ ...g, loading: true, error: "" }));
    navigator.geolocation.getCurrentPosition(
      (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, loading: false, error: "" }),
      (err) => setGps((g) => ({ ...g, loading: false, error: err.message })),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, []);

  useEffect(() => { detectGps(); }, [detectGps]);

  const handleSubmit = () => {
    if (!isPast && settings.warn_low_accuracy && gps.accuracy > 100 && !gps.error) {
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
          date: sessionDate,
          week_number: weekNumber,
          week_label: weekLabel || undefined,
          is_past_session: isPast,
          semester_start: semesterConfig?.semester_start,
          teaching_days: semesterConfig?.teaching_schedule.map((t) => t.day),
          period_count: periodCount,
          check_in_mode: periodCount >= 2 ? checkInMode : undefined,
        }),
      });
      if (!res.ok) throw new Error("เปิดคาบไม่สำเร็จ");
      const data = await res.json();

      if (isPast) {
        // Past session → go to bulk entry page
        router.push(`/admin/session/${data.session.session_id}/past-entry`);
        return;
      }

      localStorage.setItem("active_session", JSON.stringify({
        session_id: data.session.session_id,
        course_id: data.session.course_id,
        course_title: course.title,
        section: data.session.section,
        period: data.session.period,
        opened_at: new Date().toISOString(),
      }));
      router.push(`/admin/session/${data.session.session_id}`);
    } catch (e: unknown) {
      setSetupError(e instanceof Error ? e.message : "Failed to create session");
      setSubmitting(false);
    }
  };

  const today = new Date(sessionDate).toLocaleDateString("th-TH", {
    year: "numeric", month: "long", day: "numeric",
  });
  const accWidth = Math.max(4, Math.min(100, (1 - gps.accuracy / 500) * 100));
  const accColor = gps.accuracy <= 20 ? "#3B6D11" : gps.accuracy <= 100 ? "#854F0B" : "#A32D2D";
  const course = getCourse();
  const periodNum = parseInt(period, 10);
  const periodEnd = periodCount >= 2 ? calcPeriodEnd(periodNum, periodCount) : undefined;
  const periodRangeLabel = getPeriodLabel(periodNum, periodEnd);
  const periodEndWarning = periodCount >= 2 && !periodEnd;
  const hasValidGps = Number.isFinite(gps.lat) && Number.isFinite(gps.lng) && (gps.lat !== 0 || gps.lng !== 0);

  const handleMapPick = ({ lat, lng }: { lat: number; lng: number }) => {
    setGpsSource("map");
    setGps({ lat, lng, accuracy: 0, loading: false, error: "" });
  };

  return (
    <div className="space-y-4">
      {semesterConfig && (
        <div className="rounded-lg px-3 py-2 text-[12px]" style={{ backgroundColor: "#E6F1FB", color: "#185FA5" }}>
          Loaded semester config — starts {semesterConfig.semester_start}, {semesterConfig.total_weeks} weeks
        </div>
      )}

      <div className={`grid grid-cols-1 ${isPast ? "" : "xl:grid-cols-2"} gap-4 items-start`}>
        {/* Left: Course + Date + Week */}
        <div className="space-y-4">
          <div className="card space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-gray-700 mb-1">Course</label>
              {loadingCourses ? (
                <div className="input flex items-center gap-2 text-gray-400">
                  <Spinner className="h-4 w-4" /> Loading...
                </div>
              ) : (
                <select className="input" value={courseKey} onChange={(e) => setCourseKey(e.target.value)}>
                  <option value="">-- Select course --</option>
                  {courses.map((c) => (
                    <option key={`${c.course_id}__${c.section}`} value={`${c.course_id}__${c.section}`}>
                      {c.course_id} · {c.title} · Sec.{c.section}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Period selector */}
            <div>
              <label className="block text-[13px] font-medium text-gray-700 mb-1">Period</label>
              <select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>
                {PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            {/* Period duration toggle */}
            <div>
              <label className="block text-[13px] font-medium text-gray-700 mb-2">Period Duration</label>
              <div className="flex gap-2">
                {([1, 2] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => { setPeriodCount(n); if (n === 1) setCheckInMode("single"); }}
                    className="flex-1 rounded-lg text-[13px] font-medium transition-colors"
                    style={{
                      padding: "8px 0",
                      border: periodCount === n ? "2px solid #185FA5" : "1px solid #d1d5db",
                      backgroundColor: periodCount === n ? "#E6F1FB" : "white",
                      color: periodCount === n ? "#185FA5" : "#374151",
                    }}
                  >
                    {n === 1 ? "Single (1 period)" : "Double (2 periods)"}
                  </button>
                ))}
              </div>

              {/* Period range display */}
              {periodCount >= 2 && (
                <div className="mt-2 rounded-lg px-3 py-2 text-[12px]"
                  style={{ backgroundColor: periodEndWarning ? "#FCEBEB" : "#E6F1FB", color: periodEndWarning ? "#A32D2D" : "#185FA5" }}>
                  {periodEndWarning
                    ? `Period ${periodNum} + 1 exceeds คาบ 6 — please select an earlier period`
                    : periodRangeLabel}
                </div>
              )}
            </div>

            {/* Check-in mode (only for double period) */}
            {periodCount >= 2 && !periodEndWarning && (
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-2">Check-in Mode</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCheckInMode("single")}
                    className="flex-1 rounded-lg text-[13px] transition-colors"
                    style={{
                      padding: "8px 0",
                      border: checkInMode === "single" ? "2px solid #185FA5" : "1px solid #d1d5db",
                      backgroundColor: checkInMode === "single" ? "#E6F1FB" : "white",
                      color: checkInMode === "single" ? "#185FA5" : "#374151",
                    }}
                  >
                    Single Check-in
                    <span className="block text-[11px] font-normal mt-0.5" style={{ color: checkInMode === "single" ? "#185FA5" : "#6b7280" }}>
                      1 OTP covers both periods
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheckInMode("double")}
                    className="flex-1 rounded-lg text-[13px] transition-colors"
                    style={{
                      padding: "8px 0",
                      border: checkInMode === "double" ? "2px solid #185FA5" : "1px solid #d1d5db",
                      backgroundColor: checkInMode === "double" ? "#E6F1FB" : "white",
                      color: checkInMode === "double" ? "#185FA5" : "#374151",
                    }}
                  >
                    Two Check-ins
                    <span className="block text-[11px] font-normal mt-0.5" style={{ color: checkInMode === "double" ? "#185FA5" : "#6b7280" }}>
                      Separate OTP per period
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* Past session toggle */}
            <label className="flex items-center gap-3 cursor-pointer select-none rounded-lg p-3 transition-colors"
              style={{ backgroundColor: isPast ? "#FEF9EC" : "#f9fafb", border: `1px solid ${isPast ? "#EF9F27" : "transparent"}` }}>
              <input
                type="checkbox"
                checked={isPast}
                onChange={(e) => setIsPast(e.target.checked)}
                className="sr-only"
              />
              <div
                className="relative w-10 h-6 rounded-full transition-colors flex-shrink-0"
                style={{ backgroundColor: isPast ? "#EF9F27" : "#d1d5db" }}
              >
                <span
                  className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform"
                  style={{ transform: isPast ? "translateX(16px)" : "translateX(0)" }}
                  onClick={() => setIsPast(!isPast)}
                />
              </div>
              <div>
                <p className="text-[13px] font-medium" style={{ color: isPast ? "#854F0B" : "#374151" }}>
                  บันทึกย้อนหลัง (Past Session)
                </p>
                {isPast && <p className="text-[11px]" style={{ color: "#854F0B" }}>ไม่ต้องการ GPS / OTP — กรอกเช็คชื่อย้อนหลัง</p>}
              </div>
            </label>

            {/* Date */}
            <div>
              <label className="block text-[13px] font-medium text-gray-700 mb-1">
                {isPast ? "วันที่ (Past Date)" : "Date"}
              </label>
              <input
                type="date"
                className="input"
                value={sessionDate}
                max={todayIso}
                onChange={(e) => setSessionDate(e.target.value)}
              />
              {!isPast && sessionDate !== todayIso && (
                <p className="text-[11px] mt-1" style={{ color: "#854F0B" }}>
                  Using custom date: {today}
                </p>
              )}
            </div>

            {/* Week info */}
            {semesterConfig && weekNumber !== undefined && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Week #</label>
                  <input
                    type="number" min={1} max={semesterConfig.total_weeks}
                    className="input text-[13px]"
                    value={weekNumber ?? ""}
                    onChange={(e) => setWeekNumber(parseInt(e.target.value, 10) || undefined)}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Week Label</label>
                  <input
                    className="input text-[13px] font-mono"
                    value={weekLabel}
                    onChange={(e) => setWeekLabel(e.target.value)}
                    placeholder="e.g. W3, W3a"
                  />
                </div>
              </div>
            )}

            {course && (
              <div className="rounded-lg p-3 text-[11px] grid grid-cols-2 gap-2"
                style={{ backgroundColor: "#f9fafb", border: "0.5px solid rgba(0,0,0,0.08)" }}>
                <span style={{ color: "#5F5E5A" }}>Course ID: <strong className="font-mono text-gray-700">{course.course_id}</strong></span>
                <span style={{ color: "#5F5E5A" }}>Section: <strong className="text-gray-700">{course.section}</strong></span>
                <span className="col-span-2" style={{ color: "#5F5E5A" }}>Date: <strong className="text-gray-700">{today}</strong></span>
                {periodCount >= 2 && (
                  <span className="col-span-2" style={{ color: "#185FA5" }}>
                    Period: <strong>{periodRangeLabel}</strong>
                    {checkInMode === "double" && " · Two Check-ins"}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: GPS + Map (keep together) */}
        {!isPast && (
          <div className="space-y-4">
            <div className="card space-y-4 h-full">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <IconLocation size={14} className="text-[#185FA5]" /> GPS Location
                </h3>
                <button onClick={detectGps} className="btn-outline text-[13px] px-3" style={{ minHeight: 36 }}>
                  <IconRefresh size={13} /> Refresh
                </button>
              </div>
              {gps.loading ? (
                <div className="flex items-center gap-2 text-[13px] text-gray-500">
                  <Spinner className="h-4 w-4" /> กำลังหาตำแหน่ง...
                </div>
              ) : gps.error ? (
                <p className="text-[13px]" style={{ color: "#A32D2D" }}>ไม่สามารถรับ GPS: {gps.error}</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="rounded-lg px-3 py-2" style={{ backgroundColor: "#f8fafc", border: "0.5px solid rgba(0,0,0,0.08)" }}>
                    <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Coordinates</p>
                    <p className="text-[11px] font-mono text-gray-700 leading-relaxed">{gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}</p>
                    <p className="text-[11px] mt-1" style={{ color: gpsSource === "map" ? "#185FA5" : "#5F5E5A" }}>
                      Source: {gpsSource === "map" ? "Map selection" : "Device GPS"}
                    </p>
                  </div>

                  <div className="rounded-lg px-3 py-2" style={{ backgroundColor: "#f8fafc", border: "0.5px solid rgba(0,0,0,0.08)" }}>
                    <div className="flex justify-between text-[11px] mb-1" style={{ color: "#5F5E5A" }}>
                      <span>Accuracy</span>
                      <span style={{ color: accColor }}>{Math.round(gps.accuracy)} m</span>
                    </div>
                    <div className="h-2 rounded-full" style={{ backgroundColor: "#e5e7eb" }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${accWidth}%`, backgroundColor: accColor }} />
                    </div>
                  </div>
                </div>
              )}

              <div className="h-px" style={{ backgroundColor: "rgba(0,0,0,0.08)" }} />

              <GpsMapPicker
                lat={gps.lat}
                lng={gps.lng}
                radiusM={settings.radius_m}
                disabled={gps.loading}
                onUseCurrentLocation={detectGps}
                onPick={handleMapPick}
              />
            </div>
          </div>
        )}
      </div>

      <div className="card space-y-4">
        <h3 className="font-semibold text-gray-900">Settings</h3>
        {semesterConfig && (
          <p className="text-[11px]" style={{ color: "#185FA5" }}>Auto-filled from semester config</p>
        )}
        <div className="space-y-3">
          <Slider label="GPS Radius" value={settings.radius_m} min={50} max={500} step={10} unit="m"
            onChange={(v) => setSettings((s) => ({ ...s, radius_m: v }))} />
          <div className="h-px" style={{ backgroundColor: "rgba(0,0,0,0.08)" }} />
          <Slider label="OTP Expires After" value={settings.otp_expire_min} min={5} max={60} step={5} unit="min"
            onChange={(v) => setSettings((s) => ({ ...s, otp_expire_min: v }))} />
          <div className="h-px" style={{ backgroundColor: "rgba(0,0,0,0.08)" }} />
          <Slider label="Late After" value={settings.late_after_min} min={5} max={30} step={5} unit="min"
            onChange={(v) => setSettings((s) => ({ ...s, late_after_min: v }))} />
        </div>
        <div className="space-y-2 pt-3 border-t border-gray-100">
          <Toggle label="Save GPS fail check-ins" checked={settings.save_gps_fail}
            onChange={(v) => setSettings((s) => ({ ...s, save_gps_fail: v }))} />
          <Toggle label="Warn on low GPS accuracy (>100m)" checked={settings.warn_low_accuracy}
            onChange={(v) => setSettings((s) => ({ ...s, warn_low_accuracy: v }))} />
          <Toggle label="Show countdown to students" checked={settings.show_countdown}
            onChange={(v) => setSettings((s) => ({ ...s, show_countdown: v }))} />
        </div>
      </div>

      {setupError && (
        <div className="rounded-lg px-4 py-3 text-[13px]" style={{ backgroundColor: "#FCEBEB", color: "#A32D2D" }}>
          {setupError}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={
          submitting ||
          !courseKey ||
          (!isPast && (gps.loading || !hasValidGps)) ||
          (periodCount >= 2 && !!periodEndWarning)
        }
        className="btn-primary w-full py-3 text-[13px]"
      >
        {submitting
          ? <><Spinner className="h-5 w-5" /> Creating...</>
          : isPast
            ? "Create Past Session & Enter Attendance"
            : periodCount >= 2 && checkInMode === "double"
              ? "Open Double Period (Part 1) & Generate OTP"
              : "Open Session & Generate OTP"}
      </button>

      {!isPast && !gps.loading && !hasValidGps && (
        <div className="rounded-lg px-4 py-3 text-[12px]" style={{ backgroundColor: "#FEF9EC", color: "#854F0B" }}>
          Please pick a classroom location on map or refresh device GPS before opening session.
        </div>
      )}

      {showGpsWarn && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="card max-w-sm w-full space-y-4">
            <h3 className="font-medium text-gray-900 flex items-center gap-2">
              <IconWarning size={16} className="text-[#854F0B]" /> Low GPS Accuracy
            </h3>
            <p className="text-[13px] text-gray-600">
              GPS accuracy is <strong>{Math.round(gps.accuracy)} m</strong> — นักศึกษาในห้องอาจเช็คชื่อไม่ผ่าน
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowGpsWarn(false)} className="btn-outline flex-1">Wait</button>
              <button onClick={doOpen} className="btn-primary flex-1">Open Anyway</button>
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
      <div className="flex justify-between text-[13px] mb-1">
        <label className="text-gray-700">{label}</label>
        <span className="font-medium" style={{ color: "#185FA5" }}>{value} {unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full"
        style={{ accentColor: "#185FA5", touchAction: "none" }}
      />
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between cursor-pointer select-none min-h-[44px]">
      <span className="text-[13px] text-gray-700">{label}</span>
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
