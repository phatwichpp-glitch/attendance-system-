"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import Spinner from "@/components/Spinner";
import BlackoutLabelPicker from "@/components/BlackoutLabelPicker";
import { AcademicBlackout, Course, SemesterConfig } from "@/types";
import { semesterEndFromWeeks, countWeeksBetween } from "@/lib/week-utils";
import { todayLocalISO } from "@/lib/local-date";
import { THAI_MONTHS, THAI_DOW, getMonthCells } from "@/lib/calendar-grid";
import { useAcademicBlackouts } from "@/lib/hooks/useAcademicBlackouts";
import { IconChevronDown } from "@/components/icons";

const fmt = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

interface SemesterRange { start: string; end: string; }

interface CourseSemesterRow {
  course_id: string;
  section: string;
  title: string;
  start: string;
  end: string;
}

const rowKey = (r: { course_id: string; section: string }) => `${r.course_id}__${r.section}`;

interface Holiday { date: string; name: string; type: string; }

export default function CalendarClient() {
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const { blackouts, saving, deletingId, addBlackout: addBlackoutEntry, removeBlackout: removeBlackoutEntry } = useAcademicBlackouts();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [semesterRanges, setSemesterRanges] = useState<SemesterRange[]>([]);
  const [courseRows, setCourseRows] = useState<CourseSemesterRow[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState<Record<string, { start: string; end: string }>>({});
  const [rowSaving, setRowSaving] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [rowSaved, setRowSaved] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const coursesRes = await fetch("/api/sheets/courses");
      const coursesData = await coursesRes.json();
      const courseList = (coursesData.courses ?? []) as Course[];
      const configsMap = (coursesData.configs ?? {}) as Record<string, SemesterConfig>;

      const rows: CourseSemesterRow[] = [];
      const snapshot: Record<string, { start: string; end: string }> = {};
      for (const c of courseList) {
        const cfg = configsMap[rowKey(c)];
        if (!cfg?.semester_start || !cfg.total_weeks) continue;
        const end = semesterEndFromWeeks(cfg.semester_start, cfg.total_weeks) || cfg.semester_start;
        rows.push({ course_id: c.course_id, section: c.section, title: c.title, start: cfg.semester_start, end });
        snapshot[rowKey(c)] = { start: cfg.semester_start, end };
      }
      setCourseRows(rows);
      setSavedSnapshot(snapshot);

      const configs = Object.values(configsMap);
      const ranges = configs
        .filter((c) => c.semester_start && c.total_weeks)
        .map((c) => ({
          start: c.semester_start,
          end: semesterEndFromWeeks(c.semester_start, c.total_weeks) || c.semester_start,
        }));
      const seen = new Set<string>();
      setSemesterRanges(
        ranges.filter((r) => {
          const key = `${r.start}__${r.end}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
      );
    } catch {
      setError("โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // Fetch a year on each side too — the visible 6-week grid can bleed into an
    // adjacent month that falls in a different calendar year (Dec/Jan edges).
    const years = [cursor.year - 1, cursor.year, cursor.year + 1];
    fetch(`/api/holidays?years=${years.join(",")}`)
      .then((r) => r.json())
      .then((d) => setHolidays(d.holidays ?? []))
      .catch(() => {});
  }, [cursor.year]);

  const holidayMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of holidays) m.set(h.date.slice(0, 10), h.name);
    return m;
  }, [holidays]);

  const cells = useMemo(() => getMonthCells(cursor.year, cursor.month), [cursor]);
  const todayIso = todayLocalISO();

  const isInSemester = useCallback(
    (iso: string) => semesterRanges.some((r) => iso >= r.start && iso <= r.end),
    [semesterRanges]
  );
  const blackoutAt = useCallback(
    (iso: string) => (blackouts ?? []).find((b) => iso >= b.start_date && iso <= b.end_date),
    [blackouts]
  );
  const isPending = useCallback(
    (iso: string) => !!startDate && iso >= startDate && iso <= (endDate || startDate),
    [startDate, endDate]
  );

  const onDayClick = (iso: string) => {
    setError("");
    if (!startDate || (startDate && endDate)) {
      setStartDate(iso);
      setEndDate("");
      return;
    }
    if (iso < startDate) { setEndDate(startDate); setStartDate(iso); }
    else setEndDate(iso);
  };

  const clearSelection = () => { setStartDate(""); setEndDate(""); };

  const updateRow = (key: string, field: "start" | "end", value: string) => {
    setCourseRows((prev) => prev.map((r) => (rowKey(r) === key ? { ...r, [field]: value } : r)));
    setRowError((e) => ({ ...e, [key]: "" }));
  };

  const isRowDirty = (row: CourseSemesterRow) => {
    const snap = savedSnapshot[rowKey(row)];
    return !snap || snap.start !== row.start || snap.end !== row.end;
  };

  const saveRow = async (row: CourseSemesterRow) => {
    const key = rowKey(row);
    if (!row.start || !row.end) { setRowError((e) => ({ ...e, [key]: "กรอกวันเปิด-ปิดภาคเรียนให้ครบ" })); return; }
    if (row.end < row.start) { setRowError((e) => ({ ...e, [key]: "วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น" })); return; }
    const weeks = countWeeksBetween(row.start, row.end);
    if (weeks <= 0) { setRowError((e) => ({ ...e, [key]: "ช่วงวันที่นี้คำนวณจำนวนสัปดาห์ไม่ได้" })); return; }

    setRowSaving(key);
    setRowError((e) => ({ ...e, [key]: "" }));
    try {
      const res = await fetch(`/api/sheets/semester-config/${row.course_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: row.section, semester_start: row.start, total_weeks: weeks }),
      });
      if (!res.ok) { setRowError((e) => ({ ...e, [key]: "บันทึกไม่สำเร็จ" })); return; }
      setRowSaved(key);
      setTimeout(() => setRowSaved((k) => (k === key ? null : k)), 2000);
      await load();
    } catch {
      setRowError((e) => ({ ...e, [key]: "บันทึกไม่สำเร็จ" }));
    } finally {
      setRowSaving(null);
    }
  };

  const goPrev = () => setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }));
  const goNext = () => setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }));
  const goToday = () => setCursor({ year: today.getFullYear(), month: today.getMonth() });

  const addBlackout = async () => {
    setError("");
    if (!label.trim()) { setError("เลือกหรือกรอกชื่อช่วงเวลาก่อน"); return; }
    if (!startDate || !endDate) { setError("เลือกวันเริ่มต้นและวันสิ้นสุด — พิมพ์เอง หรือคลิกบนปฏิทินด้านล่าง 2 ครั้ง (วันเริ่ม แล้วก็วันสิ้นสุด)"); return; }
    if (endDate < startDate) { setError("วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น"); return; }

    const result = await addBlackoutEntry({ start_date: startDate, end_date: endDate, label: label.trim() });
    if (!result.ok) { setError(result.error); return; }
    setLabel("");
    clearSelection();
  };

  const removeBlackout = async (b: AcademicBlackout) => {
    if (!confirm(`ลบ "${b.label}" (${fmt(b.start_date)} - ${fmt(b.end_date)})?`)) return;
    const ok = await removeBlackoutEntry(b);
    if (!ok) setError("ลบไม่สำเร็จ");
  };

  if (loading || blackouts === null) {
    return <div className="flex justify-center py-20"><Spinner className="h-8 w-8 text-[#185FA5]" /></div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px]" style={{ color: "#5F5E5A" }}>
        ตั้งวันเปิด-ปิดภาคเรียนและช่วงที่ไม่เปิดคาบอัตโนมัติ (เช่น สัปดาห์สอบ) ได้ในหน้านี้ — ดูวิธีใช้แบบละเอียดที่ปุ่ม{" "}
        <span className="font-semibold">?</span> มุมขวาบน
      </p>

      <div className="card space-y-3">
        <h2 className="font-medium text-gray-900">วันเปิด-ปิดภาคเรียน (ต่อวิชา)</h2>
        {courseRows.length === 0 ? (
          <p className="text-[12px]" style={{ color: "#A0671C" }}>
            ยังไม่ได้ตั้งค่าวันเปิด-ปิดภาคเรียนของวิชาใดเลย — ตั้งได้ที่ Semester Settings ของแต่ละวิชา (ต้องตั้งวันสอนไว้ก่อน)
          </p>
        ) : (
          <div className="space-y-2">
            {courseRows.map((row) => {
              const key = rowKey(row);
              const weeks = row.start && row.end ? countWeeksBetween(row.start, row.end) : 0;
              return (
                <div key={key} className="rounded-lg p-3 space-y-2" style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}>
                  <p className="text-[13px] font-medium text-gray-900">
                    {row.title} <span className="text-gray-400 font-normal">Sec.{row.section}</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      className="input text-[13px] flex-1"
                      value={row.start}
                      max={row.end || undefined}
                      onChange={(e) => updateRow(key, "start", e.target.value)}
                    />
                    <span style={{ color: "#9ca3af" }}>–</span>
                    <input
                      type="date"
                      className="input text-[13px] flex-1"
                      value={row.end}
                      min={row.start || undefined}
                      onChange={(e) => updateRow(key, "end", e.target.value)}
                    />
                    <button
                      onClick={() => saveRow(row)}
                      disabled={rowSaving === key || !isRowDirty(row)}
                      className="btn-outline text-[12px] px-2 shrink-0"
                      style={{ minHeight: 32 }}
                    >
                      {rowSaving === key && <Spinner className="h-3 w-3" />} บันทึก
                    </button>
                  </div>
                  {weeks > 0 && (
                    <p className="text-[11px]" style={{ color: "#185FA5" }}>รวม {weeks} สัปดาห์</p>
                  )}
                  {rowError[key] && <p className="text-[11px]" style={{ color: "#A32D2D" }}>{rowError[key]}</p>}
                  {rowSaved === key && <p className="text-[11px]" style={{ color: "#3B6D11" }}>บันทึกแล้ว ✓ — ค่านี้จะแสดงบนปฏิทินด้านล่างด้วย</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card space-y-3">
        <h2 className="font-medium text-gray-900">วันที่ไม่เปิดคาบอัตโนมัติ</h2>
        <p className="text-[12px]" style={{ color: "#5F5E5A" }}>
          กำหนดช่วงวันที่ (เช่น สัปดาห์สอบกลางภาค/ปลายภาค) ที่ไม่ต้องการให้ระบบ<strong>เปิดคาบเรียนอัตโนมัติ</strong> —
          มีผลกับ<strong>ทุกวิชา</strong>ในบัญชีนี้ ไม่ใช่แค่วิชานี้วิชาเดียว ใช้ได้กับ Auto-Open เท่านั้น
          การเปิดคาบด้วยตนเองยังทำได้ตามปกติ ไม่ถูกบล็อก
        </p>
        <p className="text-[11px]" style={{ color: "#9ca3af" }}>พิมพ์วันที่เอง หรือคลิก 2 ครั้งบนปฏิทินด้านล่างก็ได้ — ทั้งสองแบบเชื่อมกัน</p>
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
          {(startDate || endDate) && (
            <button
              onClick={clearSelection}
              className="text-[12px] underline shrink-0 self-end mb-2.5"
              style={{ background: "none", border: "none", cursor: "pointer", color: "#185FA5" }}
            >
              ล้าง
            </button>
          )}
        </div>
        <div>
          <label className="block text-[12px] text-gray-500 mb-1">ชื่อช่วงเวลา</label>
          <BlackoutLabelPicker value={label} onChange={setLabel} />
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

      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={goPrev}
            aria-label="เดือนก่อนหน้า"
            className="rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            style={{ width: 28, height: 28, transform: "rotate(90deg)" }}
          >
            <IconChevronDown size={14} />
          </button>
          <button onClick={goToday} className="text-[13px] font-medium text-gray-900" style={{ background: "none", border: "none", cursor: "pointer" }}>
            {THAI_MONTHS[cursor.month]} {cursor.year + 543}
          </button>
          <button
            onClick={goNext}
            aria-label="เดือนถัดไป"
            className="rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            style={{ width: 28, height: 28, transform: "rotate(-90deg)" }}
          >
            <IconChevronDown size={14} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {THAI_DOW.map((d) => (
            <div key={d} className="text-center text-[10px] font-medium text-gray-400 py-1">{d}</div>
          ))}
          {cells.map(({ iso, day, inMonth }) => {
            const blackout = inMonth ? blackoutAt(iso) : undefined;
            const holidayName = inMonth ? holidayMap.get(iso) : undefined;
            const pending = inMonth && isPending(iso);
            const inSemester = inMonth && isInSemester(iso);
            const isToday = iso === todayIso;
            const isAnchor = iso === startDate || iso === endDate;

            let bg = "transparent";
            let color = inMonth ? "#374151" : "#d1d5db";
            if (pending) { bg = "#E6F1FB"; color = "#185FA5"; }
            else if (blackout) { bg = "#FCEBEB"; color = "#A32D2D"; }
            else if (holidayName) { bg = "#FEF9EC"; color = "#854F0B"; }
            else if (inSemester) { bg = "#f3f4f6"; color = "#4b5563"; }

            const title = [
              blackout ? `🚫 ${blackout.label}` : null,
              holidayName ? `🎌 ${holidayName}` : null,
            ].filter(Boolean).join(" · ") || undefined;

            return (
              <button
                key={iso}
                type="button"
                onClick={() => inMonth && onDayClick(iso)}
                title={title}
                disabled={!inMonth}
                className="aspect-square flex flex-col items-center justify-center rounded-lg text-[12px] relative"
                style={{
                  backgroundColor: bg,
                  color,
                  fontWeight: isToday || isAnchor ? 700 : 500,
                  border: isToday
                    ? "1.5px solid #185FA5"
                    : isAnchor
                      ? "1.5px solid #185FA5"
                      : "1px solid transparent",
                  cursor: inMonth ? "pointer" : "default",
                }}
              >
                {day}
                {inMonth && blackout && holidayName && (
                  <span
                    className="absolute rounded-full"
                    style={{ bottom: 3, width: 4, height: 4, backgroundColor: "#854F0B" }}
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-4 mt-3 text-[11px] flex-wrap" style={{ color: "#5F5E5A" }}>
          <span className="flex items-center gap-1.5">
            <span className="inline-block rounded" style={{ width: 10, height: 10, backgroundColor: "#f3f4f6", border: "1px solid #d1d5db" }} />
            ช่วงภาคเรียน
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block rounded" style={{ width: 10, height: 10, backgroundColor: "#FEF9EC", border: "1px solid #EF9F27" }} />
            วันหยุดราชการ
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block rounded" style={{ width: 10, height: 10, backgroundColor: "#FCEBEB", border: "1px solid #A32D2D" }} />
            ไม่เปิดอัตโนมัติ
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block rounded" style={{ width: 10, height: 10, backgroundColor: "#E6F1FB", border: "1px solid #185FA5" }} />
            กำลังเลือก
          </span>
        </div>
      </div>

      <div className="card space-y-2">
        <h2 className="font-medium text-gray-900">ช่วงวันที่ที่ตั้งไว้</h2>
        {blackouts.length === 0 ? (
          <p className="text-[13px]" style={{ color: "#9ca3af" }}>ยังไม่มีช่วงวันที่ — เพิ่มได้จากด้านบน</p>
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
