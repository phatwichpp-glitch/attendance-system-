"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Spinner from "@/components/Spinner";
import { IconUpload, IconCheck } from "@/components/icons";
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
      if (data.students.length === 0) throw new Error("ไม่พบรายชื่อนักศึกษา");
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
          <IconCheck size={20} className="text-[#3B6D11]" />
        </div>
        <p className="font-medium text-gray-900">
          Import successful — {parsed?.students.length} students
        </p>
        <p className="text-[11px]" style={{ color: "#5F5E5A" }}>กำลังกลับไปหน้าหลัก...</p>
      </div>
    );
  }

  if (state === "preview" && parsed) {
    return (
      <div className="space-y-4">
        <div className="card space-y-3">
          <h2 className="font-medium text-gray-900">Course Info</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
            <dt style={{ color: "#5F5E5A" }}>Course ID</dt>
            <dd className="font-mono font-medium">{parsed.course_id}</dd>
            <dt style={{ color: "#5F5E5A" }}>Title</dt>
            <dd>{parsed.title}</dd>
            <dt style={{ color: "#5F5E5A" }}>Section</dt>
            <dd>{parsed.section}</dd>
            <dt style={{ color: "#5F5E5A" }}>Lecturer</dt>
            <dd>{parsed.lecturer}</dd>
          </dl>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-gray-900">Student List</h2>
            <span className="text-[11px]" style={{ color: "#5F5E5A" }}>{parsed.students.length} students</span>
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
                  <tr key={s.student_id} className="hover:bg-gray-50">
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
          <button
            onClick={() => { setState("idle"); setParsed(null); }}
            className="btn-outline flex-1"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={submitting}
            className="btn-primary flex-1"
          >
            {submitting && <Spinner className="h-4 w-4" />}
            Confirm Import
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {state === "error" && (
        <div
          className="rounded-lg px-4 py-3 text-[13px]"
          style={{ backgroundColor: "#FCEBEB", color: "#A32D2D" }}
        >
          {error}
        </div>
      )}
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
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <input
          type="file"
          accept=".xlsx,.xls"
          className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <IconUpload size={40} className="text-gray-300 mb-3" />
        <p className="text-gray-600 font-medium">Drop file here or click to select</p>
        <p className="text-[11px] text-gray-400 mt-1">ลากไฟล์มาวางที่นี่ · รองรับ .xlsx, .xls</p>
      </label>
    </div>
  );
}
