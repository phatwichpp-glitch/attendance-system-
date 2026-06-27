"use client";
import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Spinner from "@/components/Spinner";
import { IconUpload, IconCheck } from "@/components/icons";
import {
  parseAttendanceXlsx,
  parseGenericFile,
  applyColumnMapping,
  isCmuFormat,
  ParsedImport,
  GenericFileData,
} from "@/lib/xlsx-parser";
import { DAY_NAMES, TeachingDay } from "@/types";

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Time helpers for period scheduling
const PERIOD_STARTS: Record<string, string> = {
  "1": "08:00", "2": "09:30", "3": "11:00",
  "4": "13:00", "5": "14:30", "6": "16:00",
};

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function nearestPeriod(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const totalMin = h * 60 + m;
  let best = "1";
  let bestDiff = Infinity;
  for (const [p, t] of Object.entries(PERIOD_STARTS)) {
    const [ph, pm] = t.split(":").map(Number);
    const diff = Math.abs(ph * 60 + pm - totalMin);
    if (diff < bestDiff) { bestDiff = diff; best = p; }
  }
  return best;
}

type WizardStep = "upload" | "mapper" | "preview" | "semester" | "done" | "error";

interface ColMapping {
  studentId: number;
  firstname: number;
  lastname: number;
  orderNum?: number;
}

const DEFAULT_SEMESTER = {
  semester_start: "",
  total_weeks: 15,
  teaching_days: [] as number[],
  day_start_time: {} as Record<number, string>,         // HH:MM actual class start
  day_end_time:   {} as Record<number, string>,         // HH:MM actual class end (auto or override)
  day_period_count: {} as Record<number, 1 | 2>,        // 1 (default) or 2
  day_check_in_mode: {} as Record<number, "single" | "double">, // for double-period days
  default_gps_radius: 200,
  default_otp_min: 15,
  default_late_min: 15,
  attendance_threshold: 80,
};

export default function ImportClient() {
  const router = useRouter();
  const fileRef = useRef<ArrayBuffer | null>(null);
  const [step, setStep] = useState<WizardStep>("upload");
  const [submitting, setSubmitting] = useState(false);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [generic, setGeneric] = useState<GenericFileData | null>(null);
  const [mapping, setMapping] = useState<ColMapping>({ studentId: 0, firstname: 1, lastname: 2 });
  const [manualInfo, setManualInfo] = useState({ course_id: "", title: "", section: "", lecturer: "" });
  const [semester, setSemester] = useState({ ...DEFAULT_SEMESTER });
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    setError("");
    try {
      const buffer = await file.arrayBuffer();
      fileRef.current = buffer;

      if (isCmuFormat(buffer)) {
        const data = parseAttendanceXlsx(buffer);
        if (!data.course_id) throw new Error("ไม่พบรหัสวิชา กรุณาตรวจสอบไฟล์");
        if (data.students.length === 0) throw new Error("ไม่พบรายชื่อนักศึกษา");
        setParsed(data);
        setStep("preview");
      } else {
        const data = parseGenericFile(buffer);
        if (data.headers.length === 0) throw new Error("ไม่สามารถอ่านไฟล์ได้");
        setGeneric(data);
        setMapping({ studentId: 0, firstname: 1, lastname: 2 });
        setStep("mapper");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "ไฟล์ไม่ถูกต้อง");
      setStep("error");
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const applyMapping = () => {
    if (!fileRef.current || !generic) return;
    const students = applyColumnMapping(generic.allRows, mapping);
    if (students.length === 0) { setError("ไม่พบรายชื่อนักศึกษาหลังจาก mapping"); return; }
    setParsed({ ...manualInfo, students });
    setStep("preview");
  };

  const handleImport = async () => {
    if (!parsed) return;
    setSubmitting(true);
    try {
      const teaching_schedule: TeachingDay[] = semester.teaching_days.map((d) => {
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
      const body = {
        ...parsed,
        semester_config: semester.semester_start ? {
          semester_start: semester.semester_start,
          total_weeks: semester.total_weeks,
          teaching_schedule,
          default_gps_radius: semester.default_gps_radius,
          default_otp_min: semester.default_otp_min,
          default_late_min: semester.default_late_min,
          attendance_threshold: semester.attendance_threshold,
        } : undefined,
      };
      const res = await fetch("/api/sheets/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("นำเข้าไม่สำเร็จ");
      setStep("done");
      setTimeout(() => router.push("/admin"), 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      setStep("error");
    } finally {
      setSubmitting(false);
    }
  };

  // Step indicator
  const stepNum = step === "upload" || step === "error" ? 1
    : step === "mapper" || step === "preview" ? 1
    : 2;

  // ── Done ──
  if (step === "done") {
    return (
      <div className="card text-center py-12 space-y-4">
        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: "#EAF3DE" }}>
          <IconCheck size={20} className="text-[#3B6D11]" />
        </div>
        <p className="font-medium text-gray-900">Import successful — {parsed?.students.length} students</p>
        <p className="text-[11px]" style={{ color: "#5F5E5A" }}>กำลังกลับไปหน้าหลัก...</p>
      </div>
    );
  }

  // ── Error ──
  if (step === "error") {
    return (
      <div className="space-y-3">
        <div className="rounded-lg px-4 py-3 text-[13px]" style={{ backgroundColor: "#FCEBEB", color: "#A32D2D" }}>
          {error}
        </div>
        <button onClick={() => { setStep("upload"); setError(""); }} className="btn-outline">Try again</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-[13px] mb-2">
        {[1, 2].map((n) => (
          <div key={n} className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
              style={{
                backgroundColor: stepNum >= n ? "#185FA5" : "#e5e7eb",
                color: stepNum >= n ? "white" : "#9ca3af",
              }}
            >
              {n}
            </div>
            <span style={{ color: stepNum === n ? "#185FA5" : "#9ca3af", fontWeight: stepNum === n ? 600 : 400 }}>
              {n === 1 ? (step === "mapper" || step === "preview" ? "Map Columns" : "Upload") : "Semester Setup"}
            </span>
            {n < 2 && <span className="text-gray-300">→</span>}
          </div>
        ))}
      </div>

      {/* ── Step 1a: Upload ── */}
      {step === "upload" && (
        <label
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          className="block rounded-xl text-center cursor-pointer transition-colors"
          style={{
            border: `2px dashed ${dragging ? "#185FA5" : "#d1d5db"}`,
            backgroundColor: dragging ? "#E6F1FB" : "white",
            padding: "3rem 2rem",
            minHeight: 200,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          }}
        >
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <IconUpload size={40} className="text-gray-300 mb-3" />
          <p className="text-gray-600 font-medium">Drop file here or click to select</p>
          <p className="text-[11px] text-gray-400 mt-1">รองรับ .xlsx, .xls, .csv</p>
        </label>
      )}

      {/* ── Step 1b: Column Mapper (generic format) ── */}
      {step === "mapper" && generic && (
        <div className="space-y-4">
          <div className="card space-y-4">
            <h2 className="font-medium text-gray-900">Map Columns</h2>
            <p className="text-[13px] text-gray-500">เลือกคอลัมน์ที่ตรงกับแต่ละฟิลด์</p>

            {/* Preview table */}
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="text-[11px] min-w-full">
                <thead>
                  <tr className="bg-gray-50">
                    {generic.headers.map((h, i) => (
                      <th key={i} className="px-3 py-2 text-left font-medium text-gray-500">
                        [{i}] {h || "(empty)"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {generic.preview.map((row, ri) => (
                    <tr key={ri} className="border-t border-gray-50">
                      {generic.headers.map((_, ci) => (
                        <td key={ci} className="px-3 py-1.5 text-gray-700">{row[ci] ?? ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {(["studentId", "firstname", "lastname"] as const).map((field) => (
                <div key={field}>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1 uppercase tracking-wide">
                    {field === "studentId" ? "Student ID *" : field === "firstname" ? "First Name *" : "Last Name *"}
                  </label>
                  <select
                    className="input text-[13px]"
                    value={mapping[field] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [field]: parseInt(e.target.value, 10) }))}
                  >
                    {generic.headers.map((h, i) => (
                      <option key={i} value={i}>[{i}] {h || "(empty)"}</option>
                    ))}
                  </select>
                </div>
              ))}
              <div>
                <label className="block text-[11px] font-medium text-gray-700 mb-1 uppercase tracking-wide">Order # (optional)</label>
                <select
                  className="input text-[13px]"
                  value={mapping.orderNum ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, orderNum: e.target.value ? parseInt(e.target.value, 10) : undefined }))}
                >
                  <option value="">Auto-number</option>
                  {generic.headers.map((h, i) => (
                    <option key={i} value={i}>[{i}] {h || "(empty)"}</option>
                  ))}
                </select>
              </div>
            </div>

            <h3 className="font-medium text-gray-900 mt-2">Course Info</h3>
            <div className="grid grid-cols-2 gap-3">
              {(["course_id", "title", "section", "lecturer"] as const).map((f) => (
                <div key={f}>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1 uppercase tracking-wide">
                    {f.replace("_", " ")} *
                  </label>
                  <input
                    className="input text-[13px]"
                    value={manualInfo[f]}
                    onChange={(e) => setManualInfo((m) => ({ ...m, [f]: e.target.value }))}
                    placeholder={f === "course_id" ? "e.g. 261496" : f === "section" ? "1" : ""}
                  />
                </div>
              ))}
            </div>
          </div>

          {error && <div className="rounded-lg px-3 py-2 text-[13px]" style={{ backgroundColor: "#FCEBEB", color: "#A32D2D" }}>{error}</div>}

          <div className="flex gap-3">
            <button onClick={() => setStep("upload")} className="btn-outline flex-1">Back</button>
            <button
              onClick={applyMapping}
              disabled={!manualInfo.course_id || !manualInfo.title || !manualInfo.section}
              className="btn-primary flex-1"
            >
              Preview Students
            </button>
          </div>
        </div>
      )}

      {/* ── Step 1c: Preview ── */}
      {step === "preview" && parsed && (
        <div className="space-y-4">
          <div className="card space-y-3">
            <h2 className="font-medium text-gray-900">Course Info</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
              <dt style={{ color: "#5F5E5A" }}>Course ID</dt><dd className="font-mono font-medium">{parsed.course_id}</dd>
              <dt style={{ color: "#5F5E5A" }}>Title</dt><dd>{parsed.title}</dd>
              <dt style={{ color: "#5F5E5A" }}>Section</dt><dd>{parsed.section}</dd>
              <dt style={{ color: "#5F5E5A" }}>Lecturer</dt><dd>{parsed.lecturer}</dd>
            </dl>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium text-gray-900">Student List</h2>
              <span className="text-[11px]" style={{ color: "#5F5E5A" }}>
                พบนักศึกษา {parsed.students.length} คน
              </span>
            </div>
            <div className="overflow-y-auto max-h-64">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left border-b border-gray-100" style={{ color: "#5F5E5A" }}>
                    <th className="pb-2 pr-3 font-medium">#</th>
                    <th className="pb-2 pr-3 font-medium">Student ID</th>
                    <th className="pb-2 pr-3 font-medium">First Name</th>
                    <th className="pb-2 font-medium">Last Name</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {parsed.students.map((s) => (
                    <tr key={s.student_id}>
                      <td className="py-1.5 pr-3 text-gray-400 text-[11px]">{s.order_num}</td>
                      <td className="py-1.5 pr-3 font-mono text-[11px]">{s.student_id}</td>
                      <td className="py-1.5 pr-3">{s.firstname}</td>
                      <td className="py-1.5">{s.lastname}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(generic ? "mapper" : "upload")} className="btn-outline flex-1">Back</button>
            <button onClick={() => setStep("semester")} className="btn-primary flex-1">
              Next: Semester Setup →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Semester Setup ── */}
      {step === "semester" && parsed && (
        <div className="space-y-4">
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
                  Total Weeks
                </label>
                <input
                  type="number" min={8} max={20}
                  className="input text-[13px]"
                  value={semester.total_weeks}
                  onChange={(e) => setSemester((s) => ({ ...s, total_weeks: parseInt(e.target.value, 10) || 15 }))}
                />
              </div>
            </div>

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
                {semester.teaching_days.sort((a, b) => a - b).map((d) => {
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
            <SemesterSlider label="OTP Duration" value={semester.default_otp_min} min={5} max={60} step={5} unit="min"
              onChange={(v) => setSemester((s) => ({ ...s, default_otp_min: v }))} />
            <SemesterSlider label="Late After" value={semester.default_late_min} min={5} max={30} step={5} unit="min"
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

          <div className="flex gap-3">
            <button onClick={() => setStep("preview")} className="btn-outline flex-1">Back</button>
            <button
              onClick={handleImport}
              disabled={submitting || !semester.semester_start || semester.teaching_days.length === 0}
              className="btn-primary flex-1"
            >
              {submitting && <Spinner className="h-4 w-4" />}
              Confirm Import
            </button>
          </div>
          <p className="text-[11px] text-gray-400 text-center">
            หรือ <button
              onClick={async () => {
                if (!parsed) return;
                setSubmitting(true);
                try {
                  const res = await fetch("/api/sheets/import", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(parsed),
                  });
                  if (!res.ok) throw new Error("นำเข้าไม่สำเร็จ");
                  setStep("done");
                  setTimeout(() => router.push("/admin"), 1500);
                } catch (e: unknown) {
                  setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
                  setStep("error");
                } finally {
                  setSubmitting(false);
                }
              }}
              className="underline"
              style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}
            >
              ข้ามการตั้งค่าภาคการศึกษา
            </button>
          </p>
        </div>
      )}
    </div>
  );
}

function SemesterSlider({ label, value, min, max, step, unit, onChange }: {
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
        style={{ accentColor: "#185FA5" }}
      />
    </div>
  );
}

