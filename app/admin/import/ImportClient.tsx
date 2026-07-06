"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Spinner from "@/components/Spinner";
import { IconUpload, IconCheck } from "@/components/icons";
import { openDrivePicker, isDrivePickerConfigured } from "@/lib/drive-picker";
import {
  parseAttendanceXlsx,
  parseGenericFile,
  applyColumnMapping,
  autoDetectMapping,
  parseFilenameInfo,
  isCmuFormat,
  ParsedImport,
  GenericFileData,
} from "@/lib/xlsx-parser";
import { countWeeksBetween } from "@/lib/week-utils";
import SemesterConfigForm, {
  DEFAULT_SEMESTER_FORM,
  SemesterFormState,
  buildTeachingSchedule,
} from "@/components/SemesterConfigForm";

type WizardStep = "upload" | "mapper" | "preview" | "semester" | "done" | "error";

interface ColMapping {
  studentId: number;
  firstname: number;
  lastname: number;
  orderNum?: number;
}

export default function ImportClient() {
  const router = useRouter();
  const fileRef = useRef<ArrayBuffer | null>(null);
  const [step, setStep] = useState<WizardStep>("upload");
  const [submitting, setSubmitting] = useState(false);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [generic, setGeneric] = useState<GenericFileData | null>(null);
  const [mapping, setMapping] = useState<ColMapping>({ studentId: 0, firstname: 1, lastname: 2 });
  const [manualInfo, setManualInfo] = useState({ course_id: "", title: "", section: "", lecturer: "" });
  const [semester, setSemester] = useState<SemesterFormState>({ ...DEFAULT_SEMESTER_FORM });
  const [autoDetected, setAutoDetected] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [pickingFromDrive, setPickingFromDrive] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);
  // Re-import overwrite check: upsertStudents fully replaces a course+section's
  // roster (clear-then-rewrite, no merge) — fetch what's already there so a
  // teacher re-importing an updated file sees what will change before it's silent.
  const [existingRoster, setExistingRoster] = useState<{ student_id: string }[] | null>(null);
  const [overwriteAck, setOverwriteAck] = useState(false);

  // Shared by both entry points — a locally-picked File and a file fetched
  // from Google Drive both end up here as a plain ArrayBuffer + filename.
  const processBuffer = useCallback((buffer: ArrayBuffer, filename: string) => {
    fileRef.current = buffer;

    if (isCmuFormat(buffer)) {
      const data = parseAttendanceXlsx(buffer);
      if (!data.course_id) throw new Error("ไม่พบรหัสวิชา กรุณาตรวจสอบไฟล์");
      if (data.students.length === 0) throw new Error("ไม่พบรายชื่อนักศึกษา");
      setParsed(data);
      setExistingRoster(null);
      setOverwriteAck(false);
      setStep("preview");
    } else {
      const data = parseGenericFile(buffer);
      if (data.headers.length === 0) throw new Error("ไม่สามารถอ่านไฟล์ได้");

      // Pre-scan: guess column mapping from headers/content and course info
      // from the filename, then let the admin verify before continuing.
      const detected = autoDetectMapping(data.headers, data.preview);
      const hint = parseFilenameInfo(filename);
      setGeneric(data);
      setMapping({
        studentId: detected.studentId ?? 0,
        firstname: detected.firstname ?? 1,
        lastname: detected.lastname ?? 2,
        orderNum: detected.orderNum,
      });
      setManualInfo((m) => ({
        ...m,
        course_id: hint.course_id ?? m.course_id,
        section: hint.section ?? m.section,
      }));
      setAutoDetected(
        detected.studentId !== undefined &&
        detected.firstname !== undefined &&
        detected.lastname !== undefined
      );
      setStep("mapper");
    }
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setError("");
    try {
      const buffer = await file.arrayBuffer();
      processBuffer(buffer, file.name);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "ไฟล์ไม่ถูกต้อง");
      setStep("error");
    }
  }, [processBuffer]);

  const handleDrivePick = useCallback(async () => {
    setError("");
    setPickingFromDrive(true);
    try {
      const picked = await openDrivePicker();
      if (!picked) return; // admin cancelled
      processBuffer(picked.buffer, picked.filename);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "นำเข้าจาก Drive ไม่สำเร็จ");
      setStep("error");
    } finally {
      setPickingFromDrive(false);
    }
  }, [processBuffer]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  useEffect(() => {
    if (!parsed?.course_id || !parsed?.section) return;
    let cancelled = false;
    fetch(`/api/sheets/students?course_id=${encodeURIComponent(parsed.course_id)}&section=${encodeURIComponent(parsed.section)}`)
      .then((r) => (r.ok ? r.json() : { students: [] }))
      .then((d) => { if (!cancelled) setExistingRoster(d.students ?? []); })
      .catch(() => { if (!cancelled) setExistingRoster([]); });
    return () => { cancelled = true; };
  }, [parsed?.course_id, parsed?.section]);

  const applyMapping = () => {
    if (!fileRef.current || !generic) return;
    const { students, skipped } = applyColumnMapping(generic.allRows, mapping);
    if (students.length === 0) { setError("ไม่พบรายชื่อนักศึกษาหลังจาก mapping"); return; }
    setParsed({ ...manualInfo, students, skipped });
    setExistingRoster(null);
    setOverwriteAck(false);
    setStep("preview");
  };

  const handleImport = async () => {
    if (!parsed) return;
    setSubmitting(true);
    try {
      const teaching_schedule = buildTeachingSchedule(semester);
      const { course_id, title, section, lecturer, students } = parsed;
      const body = {
        course_id, title, section, lecturer, students,
        semester_config: semester.semester_start ? {
          semester_start: semester.semester_start,
          total_weeks: countWeeksBetween(semester.semester_start, semester.semester_end) || 15,
          teaching_schedule,
          default_gps_radius: semester.default_gps_radius,
          default_otp_min: semester.default_otp_min,
          default_late_min: semester.default_late_min,
          attendance_threshold: semester.attendance_threshold,
          auto_open_enabled: semester.auto_open_enabled,
          default_lat: semester.default_lat,
          default_lng: semester.default_lng,
          auto_open_lead_min: semester.auto_open_lead_min,
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

      {step === "upload" && isDrivePickerConfigured() && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-[11px] text-gray-400">หรือ</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>
      )}

      {step === "upload" && isDrivePickerConfigured() && (
        <button
          type="button"
          onClick={handleDrivePick}
          disabled={pickingFromDrive}
          className="btn-outline w-full"
        >
          {pickingFromDrive ? <Spinner className="h-4 w-4" /> : "📁 เลือกไฟล์จาก Google Drive"}
        </button>
      )}

      {/* ── Step 1b: Column Mapper (generic format) ── */}
      {step === "mapper" && generic && (
        <div className="space-y-4">
          <div className="card space-y-4">
            <h2 className="font-medium text-gray-900">Map Columns</h2>
            {autoDetected ? (
              <div className="rounded-lg px-3 py-2 text-[12px]" style={{ backgroundColor: "#EAF3DE", color: "#3B6D11" }}>
                ✓ ระบบสแกนและจับคู่คอลัมน์ให้อัตโนมัติแล้ว — กรุณาตรวจสอบความถูกต้องก่อนดำเนินการต่อ
              </div>
            ) : (
              <p className="text-[13px] text-gray-500">เลือกคอลัมน์ที่ตรงกับแต่ละฟิลด์</p>
            )}

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

          {parsed.skipped.length > 0 && (
            <div className="rounded-lg px-4 py-3 text-[12px]" style={{ backgroundColor: "#FEF9EC", color: "#854F0B" }}>
              <div className="flex items-center justify-between">
                <span>
                  ข้าม {parsed.skipped.length} แถว — รหัสนักศึกษาไม่ถูกต้องหรือซ้ำกัน
                  (คาดว่าจะมี {parsed.students.length + parsed.skipped.length} คน แต่นำเข้าได้ {parsed.students.length} คน)
                </span>
                <button
                  type="button"
                  onClick={() => setShowSkipped((v) => !v)}
                  className="underline shrink-0 ml-3"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#854F0B" }}
                >
                  {showSkipped ? "ซ่อน" : "ดูรายละเอียด"}
                </button>
              </div>
              {showSkipped && (
                <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto font-mono text-[11px]">
                  {parsed.skipped.map((s, i) => (
                    <li key={i}>
                      แถว {s.rowNumber}: {s.reason === "duplicate_id" ? "รหัสซ้ำ" : "รหัสไม่ถูกต้อง"} — {s.raw}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

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
          <SemesterConfigForm value={semester} onChange={setSemester} />

          {existingRoster && existingRoster.length > 0 && (() => {
            const newIds = new Set(parsed.students.map((s) => s.student_id));
            const existingIds = new Set(existingRoster.map((s) => s.student_id));
            const added = parsed.students.filter((s) => !existingIds.has(s.student_id)).length;
            const removed = existingRoster.filter((s) => !newIds.has(s.student_id)).length;
            const unchanged = parsed.students.length - added;
            return (
              <div className="rounded-lg px-4 py-3 space-y-2 text-[13px]" style={{ backgroundColor: "#FCEBEB", color: "#A32D2D" }}>
                <p className="font-medium">
                  วิชานี้ (Section {parsed.section}) มีรายชื่อนักศึกษาอยู่แล้ว {existingRoster.length} คน —
                  การนำเข้านี้จะแทนที่รายชื่อเดิมทั้งหมดด้วยไฟล์ใหม่
                </p>
                <p className="text-[12px]">
                  คงเดิม {unchanged} คน · เพิ่มใหม่ {added} คน · จะถูกลบออก {removed} คน
                  {removed > 0 && " (นักศึกษาที่ไม่มีในไฟล์ใหม่ รวมถึงการแก้ไขที่เคยทำไว้ด้วยตนเอง จะหายไป)"}
                </p>
                <label className="flex items-center gap-2 text-[12px] pt-1">
                  <input type="checkbox" checked={overwriteAck} onChange={(e) => setOverwriteAck(e.target.checked)} />
                  ฉันเข้าใจและต้องการแทนที่รายชื่อเดิม
                </label>
              </div>
            );
          })()}

          <div className="flex gap-3">
            <button onClick={() => setStep("preview")} className="btn-outline flex-1">Back</button>
            <button
              onClick={handleImport}
              disabled={
                submitting ||
                !semester.semester_start ||
                countWeeksBetween(semester.semester_start, semester.semester_end) === 0 ||
                semester.teaching_days.length === 0 ||
                (semester.auto_open_enabled && (semester.default_lat == null || semester.default_lng == null)) ||
                (!!existingRoster && existingRoster.length > 0 && !overwriteAck)
              }
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

