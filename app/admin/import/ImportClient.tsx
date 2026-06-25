"use client";
import { useState, useCallback } from "react";
import Spinner from "@/components/Spinner";
import { parseAttendanceXlsx } from "@/lib/xlsx-parser";
import { ImportedData } from "@/lib/types";

type State = "idle" | "preview" | "importing" | "done" | "error";

export default function ImportClient() {
  const [state, setState] = useState<State>("idle");
  const [data, setData] = useState<ImportedData | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseAttendanceXlsx(buffer);
      setData(parsed);
      setState("preview");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "ไฟล์ไม่ถูกต้อง");
      setState("error");
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    if (!data) return;
    setState("importing");
    try {
      const res = await fetch("/api/sheets/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("นำเข้าไม่สำเร็จ");
      setState("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      setState("error");
    }
  };

  if (state === "done") return (
    <div className="card text-center py-12 space-y-4">
      <div className="w-12 h-12 bg-[#EAF3DE] rounded-full flex items-center justify-center mx-auto">
        <svg className="w-6 h-6 text-[#3B6D11]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="font-semibold text-gray-900">นำเข้าสำเร็จ {data?.students.length} คน</p>
      <button onClick={() => { setState("idle"); setData(null); }} className="btn-outline">นำเข้าไฟล์ใหม่</button>
    </div>
  );

  if (state === "preview" && data) return (
    <div className="space-y-4">
      <div className="card space-y-2">
        <h2 className="font-semibold text-gray-900">ข้อมูลรายวิชา</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div><span className="text-gray-500">รหัสวิชา:</span> <span className="font-mono font-medium">{data.course_id}</span></div>
          <div><span className="text-gray-500">Section:</span> {data.section}</div>
          <div className="col-span-2"><span className="text-gray-500">ชื่อวิชา:</span> {data.title}</div>
          <div className="col-span-2"><span className="text-gray-500">ผู้สอน:</span> {data.lecturer}</div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">รายชื่อนักศึกษา</h2>
          <span className="text-sm text-gray-500">{data.students.length} คน</span>
        </div>
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2 pr-3 font-medium">#</th>
                <th className="pb-2 pr-3 font-medium">รหัส</th>
                <th className="pb-2 pr-3 font-medium">ชื่อ</th>
                <th className="pb-2 font-medium">นามสกุล</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.students.map((s) => (
                <tr key={s.student_id} className="hover:bg-gray-50">
                  <td className="py-1.5 pr-3 text-gray-400">{s.order_num}</td>
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
        <button onClick={() => { setState("idle"); setData(null); }} className="btn-outline flex-1">
          ยกเลิก
        </button>
        <button onClick={handleImport} disabled={state === "importing"} className="btn-primary flex-1 flex items-center justify-center gap-2">
          {state === "importing" && <Spinner className="h-4 w-4" />}
          ยืนยันนำเข้า
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {state === "error" && (
        <div className="bg-[#FCEBEB] text-[#A32D2D] rounded-lg px-4 py-3 text-sm">{error}</div>
      )}
      <label
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        className={`block border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          dragging ? "border-[#185FA5] bg-blue-50" : "border-gray-300 hover:border-gray-400"
        }`}
      >
        <input type="file" accept=".xlsx,.xls" className="sr-only" onChange={onFileInput} />
        <svg className="w-10 h-10 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p className="text-gray-600 font-medium">ลากไฟล์มาวางที่นี่ หรือคลิกเลือกไฟล์</p>
        <p className="text-gray-400 text-sm mt-1">รองรับ .xlsx, .xls</p>
      </label>
    </div>
  );
}
