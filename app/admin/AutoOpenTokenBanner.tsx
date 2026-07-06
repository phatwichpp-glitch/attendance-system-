"use client";
import { useState, useEffect } from "react";
import { IconWarning } from "@/components/icons";

const DISMISS_KEY = "dismissed_auto_open_banner_date";
const STALE_DISMISS_KEY = "dismissed_scheduler_stale_banner_date";

export default function AutoOpenTokenBanner() {
  const [status, setStatus] = useState<"ok" | "invalid" | "unknown" | null>(null);
  const [schedulerStale, setSchedulerStale] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [staleDismissed, setStaleDismissed] = useState(false);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (localStorage.getItem(DISMISS_KEY) === today) setDismissed(true);
      if (localStorage.getItem(STALE_DISMISS_KEY) === today) setStaleDismissed(true);
    } catch {}

    fetch("/api/sheets/token-status")
      .then((r) => r.json())
      .then((d) => {
        setStatus(d.status ?? null);
        setSchedulerStale(!!d.schedulerStale);
      })
      .catch(() => {});
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, new Date().toISOString().slice(0, 10));
    } catch {}
  };

  const dismissStale = () => {
    setStaleDismissed(true);
    try {
      localStorage.setItem(STALE_DISMISS_KEY, new Date().toISOString().slice(0, 10));
    } catch {}
  };

  const showTokenBanner = status === "invalid" && !dismissed;
  const showStaleBanner = schedulerStale && !staleDismissed;
  if (!showTokenBanner && !showStaleBanner) return null;

  return (
    <div className="flex flex-col gap-2">
      {showTokenBanner && (
        <div
          className="rounded-lg px-4 py-3 flex items-start gap-3"
          style={{ backgroundColor: "#FCEBEB", border: "1px solid #E57373" }}
        >
          <IconWarning size={14} className="mt-0.5 flex-shrink-0 text-[#A32D2D]" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold" style={{ color: "#A32D2D" }}>
              ระบบเปิดคาบอัตโนมัติหยุดทำงาน
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "#8C3A3A" }}>
              การเข้าสู่ระบบของคุณหมดอายุ — เข้าสู่ระบบใหม่อีกครั้งเพื่อให้ auto-open ทำงานต่อ
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a href="/login" className="btn-primary text-[12px] px-3" style={{ minHeight: 32 }}>
              เข้าสู่ระบบอีกครั้ง
            </a>
            <button
              onClick={dismiss}
              className="text-[18px] leading-none"
              style={{ color: "#A32D2D", background: "none", border: "none", cursor: "pointer", padding: "0 4px" }}
              aria-label="ปิด"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {showStaleBanner && (
        <div
          className="rounded-lg px-4 py-3 flex items-start gap-3"
          style={{ backgroundColor: "#FEF3E2", border: "1px solid #F0B75F" }}
        >
          <IconWarning size={14} className="mt-0.5 flex-shrink-0 text-[#8C5A0B]" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold" style={{ color: "#8C5A0B" }}>
              ตัวจับเวลาเปิดคาบอัตโนมัติไม่ได้ทำงานอยู่
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "#8C5A0B" }}>
              ไม่พบสัญญาณว่าระบบตรวจสอบตารางสอนล่าสุด — session อาจไม่เปิดให้เองตามเวลา
              กรุณาตรวจสอบการตั้งค่า cron/CRON_SECRET กับผู้ดูแลระบบที่ดูแลการ deploy
            </p>
          </div>
          <button
            onClick={dismissStale}
            className="text-[18px] leading-none flex-shrink-0"
            style={{ color: "#8C5A0B", background: "none", border: "none", cursor: "pointer", padding: "0 4px" }}
            aria-label="ปิด"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
