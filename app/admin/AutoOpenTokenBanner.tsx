"use client";
import { useState, useEffect } from "react";
import { IconWarning } from "@/components/icons";

const DISMISS_KEY = "dismissed_auto_open_banner_date";

export default function AutoOpenTokenBanner() {
  const [status, setStatus] = useState<"ok" | "invalid" | "unknown" | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (localStorage.getItem(DISMISS_KEY) === today) setDismissed(true);
    } catch {}

    fetch("/api/sheets/token-status")
      .then((r) => r.json())
      .then((d) => setStatus(d.status ?? null))
      .catch(() => {});
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, new Date().toISOString().slice(0, 10));
    } catch {}
  };

  if (status !== "invalid" || dismissed) return null;

  return (
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
  );
}
