"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import Toggle from "@/components/Toggle";
import { DAY_NAMES, TeachingDay } from "@/types";
import { PERIOD_STARTS, addMinutes, nearestPeriod } from "@/lib/period-utils";
import { countWeeksBetween } from "@/lib/week-utils";

const GpsMapPicker = dynamic(() => import("@/app/admin/setup/GpsMapPicker"), {
  ssr: false,
  loading: () => <div className="h-64 rounded-lg" style={{ backgroundColor: "#f3f4f6" }} />,
});

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Default map center (Chiang Mai) shown before the admin has picked a location.
const DEFAULT_MAP_LAT = 18.7883;
const DEFAULT_MAP_LNG = 98.9853;

export interface SemesterFormState {
  semester_start: string;
  semester_end: string;
  teaching_days: number[];
  day_start_time: Record<number, string>;         // HH:MM actual class start
  day_end_time: Record<number, string>;           // HH:MM actual class end (auto or override)
  day_period_count: Record<number, 1 | 2>;        // 1 (default) or 2
  day_check_in_mode: Record<number, "single" | "double">; // for double-period days
  default_gps_radius: number;
  default_otp_min: number;
  default_late_min: number;
  attendance_threshold: number;
  auto_open_enabled: boolean;
  default_lat?: number;
  default_lng?: number;
}

export const DEFAULT_SEMESTER_FORM: SemesterFormState = {
  semester_start: "",
  semester_end: "",
  teaching_days: [],
  day_start_time: {},
  day_end_time: {},
  day_period_count: {},
  day_check_in_mode: {},
  default_gps_radius: 200,
  default_otp_min: 15,
  default_late_min: 15,
  attendance_threshold: 80,
  auto_open_enabled: false,
};

/** Derives the TeachingDay[] payload SemesterConfig expects from the form's per-day maps. */
export function buildTeachingSchedule(semester: SemesterFormState): TeachingDay[] {
  return semester.teaching_days.map((d) => {
    const pc = semester.day_period_count[d] ?? 1;
    const startTime = semester.day_start_time[d] ?? PERIOD_STARTS["2"];
    const endTime = semester.day_end_time[d] ?? addMinutes(startTime, pc >= 2 ? 180 : 90);
    const derivedPeriod = nearestPeriod(startTime);
    const derivedPeriodEnd = pc >= 2 ? parseInt(nearestPeriod(endTime), 10) : undefined;
    return {
      day: d,
      period: derivedPeriod,
      period_end: derivedPeriodEnd,
      period_count: pc,
      start_time: startTime,
      end_time: endTime,
      check_in_mode: pc >= 2 ? (semester.day_check_in_mode[d] ?? "single") : undefined,
    };
  });
}

/** Inverse of buildTeachingSchedule — populates the form's per-day maps from a saved SemesterConfig. */
export function teachingScheduleToFormFields(schedule: TeachingDay[]): Pick<
  SemesterFormState,
  "teaching_days" | "day_start_time" | "day_end_time" | "day_period_count" | "day_check_in_mode"
> {
  const teaching_days: number[] = [];
  const day_start_time: Record<number, string> = {};
  const day_end_time: Record<number, string> = {};
  const day_period_count: Record<number, 1 | 2> = {};
  const day_check_in_mode: Record<number, "single" | "double"> = {};

  for (const td of schedule) {
    teaching_days.push(td.day);
    if (td.start_time) day_start_time[td.day] = td.start_time;
    if (td.end_time) day_end_time[td.day] = td.end_time;
    day_period_count[td.day] = (td.period_count ?? 1) >= 2 ? 2 : 1;
    if (td.check_in_mode) day_check_in_mode[td.day] = td.check_in_mode;
  }

  return { teaching_days, day_start_time, day_end_time, day_period_count, day_check_in_mode };
}

interface SemesterConfigFormProps {
  value: SemesterFormState;
  onChange: Dispatch<SetStateAction<SemesterFormState>>;
  /** Only meaningful once a course row exists to attach it to — false during initial import. */
  showAutoOpenToggle?: boolean;
}

export default function SemesterConfigForm({
  value: semester,
  onChange: setSemester,
  showAutoOpenToggle = false,
}: SemesterConfigFormProps) {
  // "ok" = the scheduler holds a working refresh token for this account,
  // "unknown" = never registered (needs one fresh login), "invalid" = token died.
  const [tokenStatus, setTokenStatus] = useState<"ok" | "invalid" | "unknown" | null>(null);

  useEffect(() => {
    if (!showAutoOpenToggle) return;
    fetch("/api/sheets/token-status")
      .then((r) => r.json())
      .then((d) => setTokenStatus(d.status ?? null))
      .catch(() => {});
  }, [showAutoOpenToggle]);

  return (
    <>
      <div className="card space-y-4">
        <h2 className="font-medium text-gray-900">Semester Info</h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1">
              Semester Start Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              className="input text-[13px]"
              value={semester.semester_start}
              onChange={(e) => setSemester((s) => ({ ...s, semester_start: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1">
              Semester End Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              className="input text-[13px]"
              min={semester.semester_start || undefined}
              value={semester.semester_end}
              onChange={(e) => setSemester((s) => ({ ...s, semester_end: e.target.value }))}
            />
          </div>
        </div>

        {semester.semester_start && semester.semester_end && (
          countWeeksBetween(semester.semester_start, semester.semester_end) > 0 ? (
            <p className="text-[12px]" style={{ color: "#185FA5" }}>
              ✓ รวม {countWeeksBetween(semester.semester_start, semester.semester_end)} สัปดาห์ (คำนวณจากช่วงวันที่)
            </p>
          ) : (
            <p className="text-[12px]" style={{ color: "#A32D2D" }}>
              วันสุดท้ายของภาคเรียนต้องไม่มาก่อนวันเปิดภาคเรียน
            </p>
          )
        )}

        <div>
          <label className="block text-[13px] font-medium text-gray-700 mb-2">Teaching Days</label>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {DAY_SHORT.map((name, i) => {
              const selected = semester.teaching_days.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSemester((s) => ({
                    ...s,
                    teaching_days: selected
                      ? s.teaching_days.filter((d) => d !== i)
                      : [...s.teaching_days, i],
                  }))}
                  className="rounded-lg py-2 text-[13px] font-medium transition-colors"
                  style={{
                    backgroundColor: selected ? "#185FA5" : "#f3f4f6",
                    color: selected ? "white" : "#374151",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        {semester.teaching_days.length > 0 && (
          <div className="space-y-3">
            <label className="block text-[13px] font-medium text-gray-700">Teaching Day Settings</label>
            {[...semester.teaching_days].sort((a, b) => a - b).map((d) => {
              const pc = semester.day_period_count[d] ?? 1;
              const cim = semester.day_check_in_mode[d] ?? "single";
              return (
                <div key={d} className="rounded-lg p-3 space-y-3" style={{ border: "0.5px solid rgba(0,0,0,0.1)", backgroundColor: "#f9fafb" }}>
                  {/* Time range inputs */}
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium w-24 flex-shrink-0" style={{ color: "#5F5E5A" }}>{DAY_NAMES[d]}</span>
                    <input
                      type="time"
                      className="input text-[13px] flex-1"
                      value={semester.day_start_time[d] ?? PERIOD_STARTS["2"]}
                      onChange={(e) => {
                        const startTime = e.target.value;
                        const endTime = addMinutes(startTime, pc === 1 ? 90 : 180);
                        setSemester((s) => ({
                          ...s,
                          day_start_time: { ...s.day_start_time, [d]: startTime },
                          day_end_time:   { ...s.day_end_time,   [d]: endTime },
                        }));
                      }}
                    />
                    <span className="text-[13px] flex-shrink-0" style={{ color: "#9ca3af" }}>–</span>
                    <input
                      type="time"
                      className="input text-[13px] flex-1"
                      value={semester.day_end_time[d] ?? addMinutes(semester.day_start_time[d] ?? PERIOD_STARTS["2"], pc === 1 ? 90 : 180)}
                      onChange={(e) => setSemester((s) => ({
                        ...s,
                        day_end_time: { ...s.day_end_time, [d]: e.target.value },
                      }))}
                    />
                  </div>
                  {/* Period duration */}
                  <div className="flex gap-2">
                    {([1, 2] as const).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => {
                          const startTime = semester.day_start_time[d] ?? PERIOD_STARTS["2"];
                          const newEndTime = addMinutes(startTime, n === 1 ? 90 : 180);
                          setSemester((s) => ({
                            ...s,
                            day_period_count: { ...s.day_period_count, [d]: n },
                            day_end_time:     { ...s.day_end_time, [d]: newEndTime },
                          }));
                        }}
                        className="flex-1 rounded-lg text-[12px] font-medium transition-colors"
                        style={{
                          padding: "6px 0",
                          border: pc === n ? "2px solid #185FA5" : "1px solid #d1d5db",
                          backgroundColor: pc === n ? "#E6F1FB" : "white",
                          color: pc === n ? "#185FA5" : "#374151",
                        }}
                      >
                        {n === 1 ? "Single Period" : "Double Period"}
                      </button>
                    ))}
                  </div>
                  {/* Check-in mode for double period */}
                  {pc >= 2 && (
                    <div className="flex gap-2">
                      {(["single", "double"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setSemester((s) => ({
                            ...s,
                            day_check_in_mode: { ...s.day_check_in_mode, [d]: m },
                          }))}
                          className="flex-1 rounded-lg text-[12px] transition-colors"
                          style={{
                            padding: "4px 0",
                            border: cim === m ? "2px solid #185FA5" : "1px solid #d1d5db",
                            backgroundColor: cim === m ? "#E6F1FB" : "white",
                            color: cim === m ? "#185FA5" : "#374151",
                          }}
                        >
                          {m === "single" ? "1 Check-in" : "2 Check-ins"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card space-y-4">
        <h2 className="font-medium text-gray-900">Default Attendance Settings</h2>
        <SemesterSlider label="GPS Radius" value={semester.default_gps_radius} min={50} max={500} step={10} unit="m"
          onChange={(v) => setSemester((s) => ({ ...s, default_gps_radius: v }))} />
        <SemesterSlider label="OTP Duration" value={semester.default_otp_min} min={1} max={180} step={1} unit="min"
          onChange={(v) => setSemester((s) => ({ ...s, default_otp_min: v }))} />
        <SemesterSlider label="Late After" value={semester.default_late_min} min={1} max={90} step={1} unit="min"
          onChange={(v) => setSemester((s) => ({ ...s, default_late_min: v }))} />
        <div>
          <div className="flex justify-between text-[13px] mb-1">
            <label className="text-gray-700">Attendance Threshold</label>
            <span className="font-medium" style={{ color: "#185FA5" }}>{semester.attendance_threshold}%</span>
          </div>
          <input
            type="number" min={0} max={100}
            className="input text-[13px] w-24"
            value={semester.attendance_threshold}
            onChange={(e) => setSemester((s) => ({ ...s, attendance_threshold: parseInt(e.target.value, 10) || 80 }))}
          />
        </div>
      </div>

      {showAutoOpenToggle && (
        <div className="card space-y-4">
          <h2 className="font-medium text-gray-900">Auto-Open</h2>
          <Toggle
            label="เปิดคาบเรียนอัตโนมัติตามตารางสอน"
            checked={semester.auto_open_enabled}
            onChange={(v) => setSemester((s) => ({ ...s, auto_open_enabled: v }))}
          />
          {semester.auto_open_enabled && (
            <>
              {tokenStatus === "ok" && (
                <p className="text-[12px]" style={{ color: "#3B6D11" }}>
                  ✓ ระบบพร้อมเปิดคาบอัตโนมัติแทนบัญชีนี้แล้ว
                </p>
              )}
              {(tokenStatus === "unknown" || tokenStatus === "invalid") && (
                <div className="rounded-lg px-3 py-2 text-[12px]" style={{ backgroundColor: "#FCEBEB", color: "#A32D2D" }}>
                  {tokenStatus === "invalid"
                    ? "สิทธิ์เปิดคาบอัตโนมัติของบัญชีนี้หมดอายุ — กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่"
                    : "ระบบยังไม่ได้รับสิทธิ์เปิดคาบแทนบัญชีนี้ — กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่ 1 ครั้ง"}
                </div>
              )}
              <p className="text-[11px]" style={{ color: "#5F5E5A" }}>
                เลือกตำแหน่งห้องเรียนบนแผนที่ ใช้สำหรับตรวจ GPS ตอนระบบเปิดคาบให้อัตโนมัติ (ไม่มีอุปกรณ์ ณ ตอนเปิด)
              </p>
              <GpsMapPicker
                lat={semester.default_lat ?? DEFAULT_MAP_LAT}
                lng={semester.default_lng ?? DEFAULT_MAP_LNG}
                radiusM={semester.default_gps_radius}
                onPick={(coords) => setSemester((s) => ({ ...s, default_lat: coords.lat, default_lng: coords.lng }))}
              />
              {(semester.default_lat == null || semester.default_lng == null) && (
                <p className="text-[12px]" style={{ color: "#A32D2D" }}>
                  กรุณาเลือกตำแหน่งบนแผนที่ก่อนเปิดใช้งาน auto-open
                </p>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}

function SemesterSlider({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <label className="text-[13px] text-gray-700">{label}</label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={min} max={max} step={step}
            value={value}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
            }}
            className="input text-center text-[13px] font-medium"
            style={{ width: 64, minHeight: 32, color: "#185FA5" }}
          />
          <span className="text-[12px]" style={{ color: "#5F5E5A" }}>{unit}</span>
        </div>
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
