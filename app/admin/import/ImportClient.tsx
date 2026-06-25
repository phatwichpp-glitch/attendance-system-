"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Spinner from "@/components/Spinner";
import { parseAttendanceXlsx, ParsedImport } from "@/lib/xlsx-parser";

type State = "idle" | "preview" | "done" | "error";

export default function ImportClient() {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const data = parseAttendanceXlsx(buffer);
      if (!data.course_id) throw new Error("ไม่พบรหัสวิชา กรุณาตรวจสอบไฟล์");
      if (data.students.length === 0)
        throw new Error("ไม่พบรายชื่อนักศึกษา");
      setParsed(data);
      setState("preview");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "ไฟล์ไม่ถูกต้อง");
      setState("error");
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handleImport = async () => {
    if (!parsed) return;
    setSubmitting(true);
    try {
      let attempts = 0;
      let res: Response | null = null;
      while (attempts < 3) {
        try {
          res = await fetch("/api/sheets/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(parsed),
          });
          break;
        } catch {
          attempts++;
          if (attempts === 3) throw new Error("เครือข่ายขัดข้อง");
          await new Promise((r) => setTimeout(r, 1000 * attempts));
        }
      }
      if (!res || !res.ok) throw new Error("นำเข้าไม่สำเร็จ");
      setState("done");
      setTimeout(() => router.push("/admin"), 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      setState("error");
    } finally {
      setSubmitting(false);
    }
  };

  if (state === "done") {
    return (
      <div className="card text-center py-12 space-y-4">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
          style={{ backgroundColor: "#EAF3DE" }}
        >
          <svg className="w-6 h-6" style={{ color: "#3B6D11" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="font-semibold text-gray-900">
          นำเข้าสำเร็จ {parsed?.students.length} คน
        </p>
        <p className="text-sm text-gray-400">กำลังกลับไปหน้าหลัก...</p>
      </div>
    );
  }

  if (state === "preview" && parsed) {
    return (
      <div className="space-y-4">
        <div className="card space-y-3">
          <h2 className="font-semibold text-gray-900">ข้อมูลรายวิชา</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-gray-500">รหัสวิชา</dt>
            <dd className="font-mono font-medium">{parsed.course_id}</dd>
            <dt className="text-gray-500">ชื่อวิชา</dt>
            <dd className="col-span-1">{parsed.title}</dd>
            <dt className="text-gray-500">Section</dt>
            <dd>{parsed.section}</dd>
            <dt className="text-gray-500">ผู้สอน</dt>
            <dd>{parsed.lecturer}</dd>
          </dl>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">รายชื่อนักศึกษา</h2>
            <span className="text-sm text-gray-400">{parsed.students.length} คน</span>
          </div>
          <div className="overflow-y-auto max-h-64">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="pb-2 pr-3 font-medium">#</th>
                  <th className="pb-2 pr-3 font-medium">รหัส</th>
                  <th className="pb-2 pr-3 font-medium">ชื่อ</th>
                  <th className="pb-2 font-medium">นามสกุล</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {parsed.students.map((s) => (
                  <tr key={s.student_id} className="hover:bg-gray-50">
                    <td className="py-1.5 pr-3 text-gray-400 text-xs">{s.order_num}</td>
                    <td className="py-1.5 pr-3 font-mono text-xs">{s.student_id}</td>
                    <td className="py-1.5 pr-3">{s.firstname}</td>
                    <td className="py-1.5">{s.lastname}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => { setState("idle"); setParsed(null); }}
            className="btn-outline flex-1"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleImport}
            disabled={submitting}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {submitting && <Spinner className="h-4 w-4" />}
            ยืนยันนำเข้า
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {(state === "error") && (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{ backgroundColor: "#FCEBEB", color: "#A32D2D" }}
        >
          {error}
        </div>
      )}
      <label
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        className="block rounded-xl p-12 text-center cursor-pointer transition-colors"
        style={{
          border: `2px dashed ${dragging ? "#185FA5" : "#d1d5db"}`,
          backgroundColor: dragging ? "#E6F1FB" : "white",
        }}
      >
        <input
          type="file"
          accept=".xlsx,.xls"
          className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p className="text-gray-600 font-medium">ลากไฟล์มาวางที่นี่ หรือคลิกเลือกไฟล์</p>
        <p className="text-gray-400 text-sm mt-1">รองรับ .xlsx, .xls</p>
      </label>
    </div>
  );
}
