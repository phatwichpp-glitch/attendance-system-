"use client";
import { useState, useEffect, useMemo } from "react";
import { SemesterConfig } from "@/types";
import { semesterEndFromWeeks } from "@/lib/week-utils";
import { todayLocalISO } from "@/lib/local-date";
import { IconChevronDown } from "@/components/icons";

interface Holiday { date: string; name: string; type: string; }

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const THAI_DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

function pad(n: number): string { return n < 10 ? `0${n}` : `${n}`; }
function toIso(y: number, mZeroIdx: number, d: number): string {
  return `${y}-${pad(mZeroIdx + 1)}-${pad(d)}`;
}

// Google Calendar-style mini month widget — replaces the old flat list of every
// holiday in the current year (which, once /api/holidays started returning a
// whole year instead of a rolling 7-day window for the Summary grid's sake,
// rendered dozens of full-width banners on this page). Also overlays which days
// have a class scheduled, so a teacher can see at a glance which upcoming
// teaching days fall on a public holiday (and would be skipped by auto-open).
export default function CoursesCalendar() {
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() }); // month: 0-11
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [configs, setConfigs] = useState<SemesterConfig[]>([]);

  useEffect(() => {
    // Fetch a year on each side too — the visible 6-week grid can bleed into an
    // adjacent month that falls in a different calendar year (Dec/Jan edges).
    const years = [cursor.year - 1, cursor.year, cursor.year + 1];
    fetch(`/api/holidays?years=${years.join(",")}`)
      .then((r) => r.json())
      .then((d) => setHolidays(d.holidays ?? []))
      .catch(() => {});
  }, [cursor.year]);

  useEffect(() => {
    fetch("/api/sheets/courses")
      .then((r) => r.json())
      .then((d) => setConfigs(Object.values(d.configs ?? {}) as SemesterConfig[]))
      .catch(() => {});
  }, []);

  const holidayMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of holidays) m.set(h.date.slice(0, 10), h.name);
    return m;
  }, [holidays]);

  // Precompute each config's teaching-day-of-week set + semester date range once
  // per configs change, rather than per grid cell.
  const teachingRanges = useMemo(() => {
    return configs
      .filter((c) => c.semester_start && c.teaching_schedule?.length)
      .map((c) => ({
        start: c.semester_start,
        end: semesterEndFromWeeks(c.semester_start, c.total_weeks) || c.semester_start,
        days: new Set(c.teaching_schedule.map((t) => t.day)),
      }));
  }, [configs]);

  const isTeachingDay = (iso: string, dow: number): boolean =>
    teachingRanges.some((r) => r.days.has(dow) && iso >= r.start && iso <= r.end);

  const todayIso = todayLocalISO();

  const cells = useMemo(() => {
    const { year, month } = cursor;
    const firstOfMonth = new Date(Date.UTC(year, month, 1));
    const startDow = firstOfMonth.getUTCDay(); // 0=Sun
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const daysInPrevMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

    const list: { iso: string; day: number; inMonth: boolean }[] = [];
    for (let i = 0; i < startDow; i++) {
      const d = daysInPrevMonth - startDow + 1 + i;
      const m = month === 0 ? 11 : month - 1;
      const y = month === 0 ? year - 1 : year;
      list.push({ iso: toIso(y, m, d), day: d, inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      list.push({ iso: toIso(year, month, d), day: d, inMonth: true });
    }
    while (list.length % 7 !== 0 || list.length < 35) {
      const last = list[list.length - 1];
      const [y, m, d] = last.iso.split("-").map(Number);
      const next = new Date(Date.UTC(y, m - 1, d + 1));
      list.push({ iso: next.toISOString().slice(0, 10), day: next.getUTCDate(), inMonth: false });
    }
    return list;
  }, [cursor]);

  const goPrev = () => setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }));
  const goNext = () => setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }));
  const goToday = () => setCursor({ year: today.getFullYear(), month: today.getMonth() });

  return (
    <div className="card" style={{ maxWidth: 380 }}>
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
          const holidayName = holidayMap.get(iso);
          const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
          const teaching = inMonth && isTeachingDay(iso, dow);
          const isHoliday = !!holidayName;
          const isToday = iso === todayIso;

          let bg = "transparent";
          let color = inMonth ? "#374151" : "#d1d5db";
          if (inMonth && isHoliday) { bg = "#FEF9EC"; color = "#854F0B"; }
          else if (inMonth && teaching) { bg = "#E6F1FB"; color = "#185FA5"; }

          const title = [
            holidayName ? `🎌 ${holidayName}` : null,
            teaching ? "มีคาบเรียนตามตาราง" : null,
          ].filter(Boolean).join(" · ") || undefined;

          return (
            <div
              key={iso}
              title={title}
              className="aspect-square flex flex-col items-center justify-center rounded-lg text-[12px] relative"
              style={{
                backgroundColor: bg,
                color,
                fontWeight: isToday ? 700 : 500,
                border: isToday ? "1.5px solid #185FA5" : "1px solid transparent",
              }}
            >
              {day}
              {inMonth && teaching && isHoliday && (
                <span
                  className="absolute rounded-full"
                  style={{ bottom: 3, width: 4, height: 4, backgroundColor: "#185FA5" }}
                  aria-hidden
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-3 text-[11px]" style={{ color: "#5F5E5A" }}>
        <span className="flex items-center gap-1.5">
          <span className="inline-block rounded" style={{ width: 10, height: 10, backgroundColor: "#E6F1FB" }} />
          มีคาบเรียน
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block rounded" style={{ width: 10, height: 10, backgroundColor: "#FEF9EC", border: "1px solid #EF9F27" }} />
          วันหยุดราชการ
        </span>
      </div>
    </div>
  );
}
