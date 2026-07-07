"use client";
import { useState, useEffect, useCallback } from "react";
import Spinner from "@/components/Spinner";
import { AcademicBlackout } from "@/types";

const fmt = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

export default function CalendarClient() {
  const [blackouts, setBlackouts] = useState<AcademicBlackout[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sheets/academic-calendar");
      const d = await res.json();
      setBlackouts(d.blackouts ?? []);
    } catch {
      setError("โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addBlackout = async () => {
    setError("");
    if (!label.trim()) { setError("กรอกชื่อช่วงเวลาก่อน (เช่น สอบกลางภาค)"); return; }
    if (!startDate || !endDate) { setError("เลือกวันเริ่มต้นและวันสิ้นสุด"); return; }
    if (endDate < startDate) { setError("วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น"); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/sheets/academic-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: startDate, end_date: endDate, label: label.trim() }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error === "end_before_start" ? "วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น" : "บันทึกไม่สำเร็จ");
        return;
      }
      setBlackouts((prev) => [...(prev ?? []), d.blackout].sort((a, b) => a.start_date.localeCompare(b.start_date)));
      setLabel("");
      setStartDate("");
      setEndDate("");
    } catch {
      setError("บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const removeBlackout = async (b: AcademicBlackout) => {
    if (!confirm(`ลบ "${b.label}" (${fmt(b.start_date)} - ${fmt(b.end_date)})?`)) return;
    setDeletingId(b.id);
    try {
      const res = await fetch(`/api/sheets/academic-calendar?id=${encodeURIComponent(b.id)}`, { method: "DELETE" });
      if (!res.ok) { setError("ลบไม่สำเร็จ"); return; }
      setBlackouts((prev) => (prev ?? []).filter((x) => x.id !== b.id));
    } catch {
      setError("ลบไม่สำเร็จ");
    } finally {
      setDeletingId(null);
    }
  };

  if (loading || blackouts === null) {
    return <div className="flex justify-center py-20"><Spinner className="h-8 w-8 text-[#185FA5]" /></div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px]" style={{ color: "#5F5E5A" }}>
        ในช่วงวันที่กำหนดไว้นี้ ระบบจะ<strong>ไม่เปิดคาบเรียนอัตโนมัติ</strong>ให้ทุกวิชาในบัญชีนี้
        (เช่น สัปดาห์สอบกลางภาค/ปลายภาค) — ใช้ได้กับ Auto-Open เท่านั้น การเปิดคาบด้วยตนเองยังทำได้ตามปกติ
      </p>

      <div className="card space-y-3">
        <h2 className="font-medium text-gray-900">เพิ่มช่วงวันที่</h2>
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
          onClick={addBlackout}
          disabled={saving}
          className="btn-primary text-[13px] px-3"
          style={{ minHeight: 36 }}
        >
          {saving && <Spinner className="h-4 w-4" />} เพิ่ม
        </button>
        {error && <p className="text-[11px]" style={{ color: "#A32D2D" }}>{error}</p>}
      </div>

      <div className="card space-y-2">
        <h2 className="font-medium text-gray-900">ช่วงวันที่ที่ตั้งไว้</h2>
        {blackouts.length === 0 ? (
          <p className="text-[13px]" style={{ color: "#9ca3af" }}>ยังไม่มีช่วงวันที่ — เพิ่มด้านบนได้เลย</p>
        ) : (
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
                  onClick={() => removeBlackout(b)}
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
    </div>
  );
}
