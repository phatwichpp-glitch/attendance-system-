"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Spinner from "@/components/Spinner";
import { IconWarning } from "@/components/icons";

interface StoredSession {
  session_id: string;
  course_id: string;
  course_title: string;
  section: string;
  period: string;
  opened_at: string;
}

export default function ActiveSessionBanner() {
  const router = useRouter();
  const [stored, setStored] = useState<StoredSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("active_session");
    if (!raw) { setLoading(false); return; }

    let parsed: StoredSession;
    try { parsed = JSON.parse(raw); }
    catch { localStorage.removeItem("active_session"); setLoading(false); return; }

    fetch(`/api/sheets/session/${parsed.session_id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.session && !d.session.closed_at) {
          setStored(parsed);
        } else {
          localStorage.removeItem("active_session");
        }
      })
      .catch(() => { /* transient error — keep stored data, show banner */ setStored(parsed); })
      .finally(() => setLoading(false));
  }, []);

  const handleClose = async () => {
    if (!stored) return;
    setClosing(true);
    try {
      await fetch("/api/sheets/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: stored.session_id,
          course_id: stored.course_id,
          section: stored.section,
        }),
      });
      localStorage.removeItem("active_session");
      setStored(null);
    } finally {
      setClosing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[13px] text-gray-400 mb-4">
        <Spinner className="h-4 w-4" /> กำลังตรวจสอบคาบเรียน...
      </div>
    );
  }

  if (!stored) return null;

  return (
    <div
      className="rounded-xl px-4 py-3 mb-4 flex flex-wrap items-center justify-between gap-3"
      style={{ backgroundColor: "#FAEEDA", border: "1px solid #EF9F27" }}
    >
      <div className="flex items-start gap-2 min-w-0">
        <IconWarning size={14} className="text-[#854F0B] mt-0.5 flex-shrink-0" />
        <div className="min-w-0">
          <p className="font-medium text-[13px]" style={{ color: "#78350F" }}>
            คาบเรียนกำลังดำเนินอยู่
          </p>
          <p className="text-[11px] mt-0.5 truncate" style={{ color: "#92400E" }}>
            {stored.course_id} · {stored.course_title} · Sec.{stored.section} · Period {stored.period}
          </p>
        </div>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <button
          onClick={() => router.push(`/admin/session/${stored.session_id}`)}
          className="btn-primary text-[13px]"
          style={{ minHeight: 36 }}
        >
          กลับไป Dashboard
        </button>
        <button
          onClick={handleClose}
          disabled={closing}
          className="btn-danger text-[13px] flex items-center gap-1"
          style={{ minHeight: 36 }}
        >
          {closing && <Spinner className="h-3 w-3" />} ปิดคาบ
        </button>
      </div>
    </div>
  );
}
