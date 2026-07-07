"use client";
import { useState } from "react";
import Spinner from "@/components/Spinner";
import { AcademicBlackout } from "@/types";
import { useAcademicBlackouts } from "@/lib/hooks/useAcademicBlackouts";

const fmt = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

// Quick-add card for the shared "no auto-open" date ranges — embedded directly
// on a course's Semester Settings page so admins don't have to leave this page
// to set exam-week blackouts. Same lib/hooks/useAcademicBlackouts.ts as the
// full Calendar page, so entries made here show up there too (and vice versa).
export default function BlackoutDatesCard() {
  const { blackouts, saving, deletingId, addBlackout, removeBlackout } = useAcademicBlackouts();
  const [label, setLabel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState("");

  const handleAdd = async () => {
    setError("");
    if (!label.trim()) { setError("กรอกชื่อช่วงเวลาก่อน (เช่น สอบกลางภาค)"); return; }
    if (!startDate || !endDate) { setError("เลือกวันเริ่มต้นและวันสิ้นสุด"); return; }
    if (endDate < startDate) { setError("วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น"); return; }

    const result = await addBlackout({ start_date: startDate, end_date: endDate, label: label.trim() });
    if (!result.ok) { setError(result.error); return; }
    setLabel("");
    setStartDate("");
    setEndDate("");
  };

  const handleRemove = async (b: AcademicBlackout) => {
    if (!confirm(`ลบ "${b.label}" (${fmt(b.start_date)} - ${fmt(b.end_date)})?`)) return;
    await removeBlackout(b);
  };

  return (
    <div className="card space-y-3">
      <h2 className="font-medium text-gray-900">วันที่ไม่เปิดคาบอัตโนมัติ</h2>
      <p className="text-[12px]" style={{ color: "#5F5E5A" }}>
        ช่วงวันที่นี้มีผลกับ<strong>ทุกวิชา</strong>ในบัญชีนี้ ไม่ใช่แค่วิชานี้วิชาเดียว (เช่น สัปดาห์สอบกลางภาค/ปลายภาค) —
        ใช้ได้กับ Auto-Open เท่านั้น การเปิดคาบด้วยตนเองยังทำได้ตามปกติ ดูปฏิทินแบบเต็มได้ที่เมนู{" "}
        <a href="/admin/calendar" className="underline" style={{ color: "#185FA5" }}>Calendar</a>
      </p>

      <div>
        <label className="block text-[12px] text-gray-500 mb-1">ชื่อช่วงเวลา</label>
        <input
          type="text"
          className="input text-[13px] w-full"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="เช่น สอบกลางภาค"
        />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-[12px] text-gray-500 mb-1">วันเริ่มต้น</label>
          <input
            type="date"
            className="input text-[13px] w-full"
            value={startDate}
            max={endDate || undefined}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="flex-1">
          <label className="block text-[12px] text-gray-500 mb-1">วันสิ้นสุด</label>
          <input
            type="date"
            className="input text-[13px] w-full"
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>
      <button
        onClick={handleAdd}
        disabled={saving}
        className="btn-outline text-[13px] px-3"
        style={{ minHeight: 36 }}
      >
        {saving && <Spinner className="h-4 w-4" />} เพิ่ม
      </button>
      {error && <p className="text-[11px]" style={{ color: "#A32D2D" }}>{error}</p>}

      {blackouts === null ? (
        <div className="flex justify-center py-6"><Spinner className="h-5 w-5 text-[#185FA5]" /></div>
      ) : blackouts.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {blackouts.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-gray-900 truncate">{b.label}</p>
                <p className="text-[12px]" style={{ color: "#5F5E5A" }}>
                  {fmt(b.start_date)} – {fmt(b.end_date)}
                </p>
              </div>
              <button
                onClick={() => handleRemove(b)}
                disabled={deletingId === b.id}
                className="text-[12px] underline shrink-0"
                style={{ background: "none", border: "none", cursor: "pointer", color: "#A32D2D" }}
              >
                {deletingId === b.id ? <Spinner className="h-3 w-3" /> : "ลบ"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
