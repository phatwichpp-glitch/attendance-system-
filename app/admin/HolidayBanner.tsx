"use client";
import { useState, useEffect } from "react";

interface Holiday {
  date: string;
  name: string;
  type: string;
}

export default function HolidayBanner() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const stored = localStorage.getItem("dismissed_holidays");
      if (stored) setDismissed(new Set(JSON.parse(stored)));
    } catch {}

    fetch("/api/holidays")
      .then((r) => r.json())
      .then((d) => setHolidays(d.holidays ?? []))
      .catch(() => {});
  }, []);

  const dismiss = (date: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(date);
      try { localStorage.setItem("dismissed_holidays", JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const visible = holidays.filter((h) => !dismissed.has(h.date.slice(0, 10)));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      {visible.map((h) => {
        const dateStr = h.date.slice(0, 10);
        const formatted = new Date(dateStr).toLocaleDateString("th-TH", {
          weekday: "long", year: "numeric", month: "long", day: "numeric",
        });
        return (
          <div
            key={dateStr}
            className="rounded-lg px-4 py-3 flex items-start gap-3"
            style={{ backgroundColor: "#FEF9EC", border: "1px solid #EF9F27" }}
          >
            <span className="text-xl leading-none mt-0.5">🎌</span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold" style={{ color: "#854F0B" }}>{h.name}</p>
              <p className="text-[11px]" style={{ color: "#A0671C" }}>{formatted}</p>
            </div>
            <button
              onClick={() => dismiss(dateStr)}
              className="text-[18px] leading-none flex-shrink-0"
              style={{ color: "#A0671C", background: "none", border: "none", cursor: "pointer", padding: "0 4px" }}
              aria-label="ปิด"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
