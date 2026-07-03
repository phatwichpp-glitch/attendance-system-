"use client";
import { useState, useEffect } from "react";
import { IconWarning } from "@/components/icons";

// Not dismissible, unlike AutoOpenTokenBanner: a missing Redis config on Vercel
// means session-store/token-registry are silently running on a fallback that
// doesn't work across serverless instances (check-ins can 404 for students
// hitting a different instance than the one that opened the session), so this
// stays visible every load until an admin actually fixes the env vars.
export default function StorageHealthBanner() {
  const [storageOk, setStorageOk] = useState(true);

  useEffect(() => {
    fetch("/api/system/health")
      .then((r) => r.json())
      .then((d) => setStorageOk(d.storageOk !== false))
      .catch(() => {});
  }, []);

  if (storageOk) return null;

  return (
    <div
      className="rounded-lg px-4 py-3 flex items-start gap-3"
      style={{ backgroundColor: "#FCEBEB", border: "1px solid #E57373" }}
    >
      <IconWarning size={14} className="mt-0.5 flex-shrink-0 text-[#A32D2D]" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold" style={{ color: "#A32D2D" }}>
          ยังไม่ได้ตั้งค่า Redis (UPSTASH_REDIS_REST_URL / TOKEN)
        </p>
        <p className="text-[11px] mt-0.5" style={{ color: "#8C3A3A" }}>
          ระบบนี้รันบน Vercel แต่ไม่มี Redis ผูกไว้ — การเช็คชื่อของนักศึกษาและระบบเปิดคาบอัตโนมัติอาจล้มเหลวเป็นบางครั้ง
          เพราะ session/token ถูกเก็บไว้ใน memory ของแต่ละ instance เท่านั้น กรุณาตั้งค่า environment variable บน Vercel แล้ว deploy ใหม่
        </p>
      </div>
    </div>
  );
}
