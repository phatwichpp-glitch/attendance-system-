"use client";
import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import Spinner from "@/components/Spinner";
import Slider from "@/components/Slider";
import Toggle from "@/components/Toggle";
import { IconLocation, IconRefresh, IconWarning } from "@/components/icons";
import { Course, Settings, DEFAULT_SETTINGS, SemesterConfig } from "@/types";
import { loadSettings, saveSettings, loadPeriodPrefs, savePeriodPrefs } from "@/lib/settings";
import { getWeekLabel } from "@/lib/week-utils";
import { todayLocalISO } from "@/lib/local-date";
import { getPeriodLabel, calcPeriodEnd, nearestPeriod, addMinutes, PERIOD_STARTS } from "@/lib/period-utils";

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
  const [classStartTime, setClassStartTime] = useState(PERIOD_STARTS["3"]); // 11:00 default
  const [classEndTime, setClassEndTime] = useState("12:30");
  const [periodCount, setPeriodCount] = useState<1 | 2>(1);
  const [checkInMode, setCheckInMode] = useState<"single" | "double">("single");
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS });
  const [gps, setGps] = useState<GpsState>({ lat: 0, lng: 0, accuracy: 0, loading: true, error: "" });
  const [gpsSource, setGpsSource] = useState<"device" | "map">("device");
  const [submitting, setSubmitting] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [showGpsWarn, setShowGpsWarn] = useState(false);
  const [showOpenConfirm, setShowOpenConfirm] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [semesterConfig, setSemesterConfig] = useState<SemesterConfig | null>(null);

  // Week / date fields
  const todayIso = todayLocalISO();
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

    // Load saved preferences synchronously first so the UI doesn't flicker
    const saved = loadSettings(course.course_id);
    const savedPeriod = loadPeriodPrefs(course.course_id);
    setSettings(saved);
    if (savedPeriod) {
      if (savedPeriod.start_time) setClassStartTime(savedPeriod.start_time);
      if (savedPeriod.end_time) setClassEndTime(savedPeriod.end_time);
      setPeriodCount(savedPeriod.period_count);
      setCheckInMode(savedPeriod.check_in_mode);
    }

    fetch(`/api/sheets/semester-config/${course.course_id}?section=${course.section}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d?.config) { setSemesterConfig(null); return; }
        const cfg: SemesterConfig = d.config;
        setSemesterConfig(cfg);

        // Merge: semester config provides defaults, saved localStorage wins on conflict
        const configDefaults = {
          ...DEFAULT_SETTINGS,
          radius_m: cfg.default_gps_radius,
          otp_expire_min: cfg.default_otp_min,
          late_after_min: cfg.default_late_min,
        };
        setSettings({ ...configDefaults, ...saved });

        // Auto-fill class time from teaching schedule only if user has no saved preference.
        // Try today's DOW first; fall back to the first configured teaching day so the form
        // always shows a sensible time even when opened on a non-teaching day.
        if (!savedPeriod) {
          const todayDow = new Date().getDay();
          const todayEntry = cfg.teaching_schedule.find((t) => t.day === todayDow)
            ?? cfg.teaching_schedule[0];
          if (todayEntry) {
            const defaultStart = todayEntry.start_time ?? (PERIOD_STARTS[todayEntry.period] ?? "09:30");
            const pc = todayEntry.period_count ?? 1;
            const defaultEnd = todayEntry.end_time ?? addMinutes(defaultStart, pc >= 2 ? 180 : 90);
            setClassStartTime(defaultStart);
            setClassEndTime(defaultEnd);
            setPeriodCount(pc >= 2 ? 2 : 1);
            if (pc >= 2) setCheckInMode(todayEntry.check_in_mode ?? "single");
          }
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
    const computed = getWeekLabel(sessionD, semStart, days);
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
    setShowOpenConfirm(true);
  };

  const doOpen = async () => {
    setShowGpsWarn(false);
    setSubmitting(true);
    const course = getCourse();
    if (!course) { setSubmitting(false); return; }
    const period = nearestPeriod(classStartTime);
    saveSettings(course.course_id, settings);
    savePeriodPrefs(course.course_id, {
      period,
      period_count: periodCount,
      check_in_mode: checkInMode,
      start_time: classStartTime,
      end_time: classEndTime,
    });

    try {
      const res = await fetch("/api/sheets/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_id: course.course_id,
          section: course.section,
          period,            // "1"–"6", derived from classStartTime via nearestPeriod
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
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(
          errBody.error === "session_already_open"
            ? "คาบนี้เปิดอยู่แล้ว — มี session เดิมสำหรับวิชา/section/คาบนี้ที่ยังไม่ปิด"
            : "เปิดคาบไม่สำเร็จ"
        );
      }
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
  const accLabel = gps.accuracy <= 20 ? "Excellent" : gps.accuracy <= 50 ? "Good" : gps.accuracy <= 100 ? "Fair" : "Poor";
  const course = getCourse();
  const period = nearestPeriod(classStartTime);
  const periodNum = parseInt(period, 10);

  // Class duration in minutes — used as max range for OTP and Late sliders
  const classDurationMin = (() => {
    const [sh, sm] = classStartTime.split(":").map(Number);
    const [eh, em] = classEndTime.split(":").map(Number);
    const d = (eh * 60 + em) - (sh * 60 + sm);
    return d > 0 ? d : 90;
  })();
  const periodEnd = periodCount >= 2 ? calcPeriodEnd(periodNum, periodCount) : undefined;
  const periodRangeLabel = getPeriodLabel(periodNum, periodEnd, classStartTime, classEndTime);
  const periodEndWarning = periodCount >= 2 && !periodEnd;
  const hasValidGps = Number.isFinite(gps.lat) && Number.isFinite(gps.lng) && (gps.lat !== 0 || gps.lng !== 0);

  const handleMapPick = ({ lat, lng }: { lat: number; lng: number }) => {
    setGpsSource("map");
    setGps({ lat, lng, accuracy: 0, loading: false, error: "" });
  };

  return (
    <>
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
      {semesterConfig && (
        <div className="rounded-lg px-3 py-2 text-[12px] flex items-center gap-2" style={{ backgroundColor: "#E6F1FB", color: "#185FA5" }}>
          <span>✓</span> Schedule auto-filled from semester config ({semesterConfig.total_weeks} weeks)
        </div>
      )}

      <div className="space-y-4">
        {/* Course + Date + Week */}
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

            {/* Class time inputs */}
            <div>
              <label className="block text-[13px] font-medium text-gray-700 mb-1">Class Time</label>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  className="input flex-1"
                  value={classStartTime}
                  onChange={(e) => {
                    const t = e.target.value;
                    setClassStartTime(t);
                    setClassEndTime(addMinutes(t, periodCount === 1 ? 90 : 180));
                  }}
                />
                <span className="text-gray-400 text-[13px] flex-shrink-0">–</span>
                <input
                  type="time"
                  className="input flex-1"
                  value={classEndTime}
                  onChange={(e) => setClassEndTime(e.target.value)}
                />
              </div>
            </div>

            {/* Period duration toggle */}
            <div>
              <label className="block text-[13px] font-medium text-gray-700 mb-2">Period Duration</label>
              <div className="flex gap-2">
                {([1, 2] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setPeriodCount(n);
                      setClassEndTime(addMinutes(classStartTime, n === 1 ? 90 : 180));
                      if (n === 1) setCheckInMode("single");
                    }}
                    className="flex-1 rounded-lg text-[13px] font-medium transition-colors"
                    style={{
                      padding: "8px 0",
                      minHeight: 44,
                      border: periodCount === n ? "2px solid #185FA5" : "1px solid #d1d5db",
                      backgroundColor: periodCount === n ? "#E6F1FB" : "white",
                      color: periodCount === n ? "#185FA5" : "#374151",
                    }}
                  >
                    {n === 1 ? "Single (1 period)" : "Double (2 periods)"}
                  </button>
                ))}
              </div>

              {/* Period range display — always shown */}
              <div className="mt-2 rounded-lg px-3 py-2 text-[12px]"
                style={{ backgroundColor: periodEndWarning ? "#FCEBEB" : "#E6F1FB", color: periodEndWarning ? "#A32D2D" : "#185FA5" }}>
                {periodEndWarning
                  ? `Period ${periodNum} + 1 exceeds คาบ 6 — please select an earlier period`
                  : periodRangeLabel}
              </div>
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
                      minHeight: 44,
                      border: checkInMode === "single" ? "2px solid #185FA5" : "1px solid #d1d5db",
                      backgroundColor: checkInMode === "single" ? "#E6F1FB" : "white",
                      color: checkInMode === "single" ? "#185FA5" : "#374151",
                    }}
                  >
                    Single Check-in
                    <span className="block text-[12px] font-normal mt-0.5" style={{ color: checkInMode === "single" ? "#185FA5" : "#6b7280" }}>
                      1 OTP covers both periods
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheckInMode("double")}
                    className="flex-1 rounded-lg text-[13px] transition-colors"
                    style={{
                      padding: "8px 0",
                      minHeight: 44,
                      border: checkInMode === "double" ? "2px solid #185FA5" : "1px solid #d1d5db",
                      backgroundColor: checkInMode === "double" ? "#E6F1FB" : "white",
                      color: checkInMode === "double" ? "#185FA5" : "#374151",
                    }}
                  >
                    Two Check-ins
                    <span className="block text-[12px] font-normal mt-0.5" style={{ color: checkInMode === "double" ? "#185FA5" : "#6b7280" }}>
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
                    placeholder="e.g. W3m, W3th"
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

        {/* GPS + Map (keep together) */}
        {!isPast && (
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <IconLocation size={14} className="text-[#185FA5]" /> GPS Location
              </h3>
              <button type="button" onClick={detectGps} className="btn-outline text-[13px] px-3" style={{ minHeight: 36 }}>
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
                    <span style={{ color: accColor }}>
                      {gpsSource === "map" ? "Map selected" : `${Math.round(gps.accuracy)} m · ${accLabel}`}
                    </span>
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
          <MinuteSlider label="OTP Expires After" value={settings.otp_expire_min} min={1} max={classDurationMin} unit="min"
            onChange={(v) => setSettings((s) => ({ ...s, otp_expire_min: v }))} />
          <div className="h-px" style={{ backgroundColor: "rgba(0,0,0,0.08)" }} />
          <Toggle label="Enable late status" checked={settings.late_enabled}
            onChange={(v) => setSettings((s) => ({ ...s, late_enabled: v }))} />
          <div className={settings.late_enabled ? "" : "opacity-40 pointer-events-none"}>
            <MinuteSlider label="Late After" value={settings.late_after_min} min={1} max={classDurationMin} unit="min"
              onChange={(v) => setSettings((s) => ({ ...s, late_after_min: v }))} />
          </div>
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

      {!isPast && !gps.loading && !hasValidGps && (
        <div className="rounded-lg px-4 py-3 text-[12px]" style={{ backgroundColor: "#FEF9EC", color: "#854F0B" }}>
          Please pick a classroom location on the map or refresh device GPS before opening a session.
        </div>
      )}

      {setupError && (
        <div className="rounded-lg px-4 py-3 text-[13px]" style={{ backgroundColor: "#FCEBEB", color: "#A32D2D" }}>
          {setupError}
        </div>
      )}

      <button
        type="submit"
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
              ? "Open Double Period & Generate OTP"
              : "Open Session & Generate OTP"}
      </button>
    </form>

    {showGpsWarn && (
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
        <div className="card max-w-sm w-full space-y-4">
          <h3 className="font-medium text-gray-900 flex items-center gap-2">
            <IconWarning size={16} className="text-[#854F0B]" /> Low GPS Accuracy
          </h3>
          <p className="text-[13px] text-gray-600">
            GPS accuracy is <strong>{Math.round(gps.accuracy)} m</strong> — students inside the room may fail to check in.
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={() => setShowGpsWarn(false)} className="btn-outline flex-1">Cancel</button>
            <button type="button" onClick={doOpen} className="btn-primary flex-1">Open Anyway</button>
          </div>
        </div>
      </div>
    )}

    {showOpenConfirm && course && (
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
        <div className="card max-w-sm w-full space-y-4">
          <h3 className="font-medium text-gray-900">
            {isPast ? "Create past session?" : "Open this session?"}
          </h3>
          <div className="text-[13px] text-gray-600 space-y-1">
            <p><strong>{course.title}</strong> · Section {course.section}</p>
            <p>{periodRangeLabel}</p>
            <p>{today}{isPast ? "" : " · now"}</p>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setShowOpenConfirm(false)} className="btn-outline flex-1">Cancel</button>
            <button type="button" onClick={() => { setShowOpenConfirm(false); doOpen(); }} className="btn-primary flex-1">
              {isPast ? "Create" : "Open"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// Slider + number input combo — supports manual typing with minute precision
function MinuteSlider({ label, value, min, max, unit, onChange }: {
  label: string; value: number; min: number; max: number; unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[13px] mb-1.5">
        <label className="text-gray-700">{label}</label>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={min}
            max={max}
            step={1}
            value={value}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
            }}
            className="w-14 text-center rounded-lg text-[13px] font-medium py-0.5 px-1"
            style={{ color: "#185FA5", border: "1px solid #d1d5db" }}
          />
          <span className="text-[12px] text-gray-500">{unit}</span>
        </div>
      </div>
      <input
        type="range" min={min} max={max} step={1}
        value={Math.min(value, max)}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full"
        style={{ accentColor: "#185FA5", touchAction: "none" }}
      />
      <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
        <span>{min}</span>
        <span style={{ color: "#185FA5" }}>{max} {unit} (class duration)</span>
      </div>
    </div>
  );
}

