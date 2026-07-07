"use client";
import { useState, useEffect, useCallback } from "react";
import { AcademicBlackout } from "@/types";

// Shared CRUD for the admin-wide "no auto-open" date ranges (academic_calendar
// sheet) — used by both the visual Calendar page and the quick-add card on a
// course's Semester Settings page, so add/delete stay consistent wherever the
// admin enters them from.
export function useAcademicBlackouts() {
  const [blackouts, setBlackouts] = useState<AcademicBlackout[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sheets/academic-calendar");
      const d = await res.json();
      setBlackouts(d.blackouts ?? []);
    } catch {
      setLoadError("โหลดข้อมูลไม่สำเร็จ");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addBlackout = useCallback(
    async (input: { start_date: string; end_date: string; label: string }): Promise<{ ok: true } | { ok: false; error: string }> => {
      setSaving(true);
      try {
        const res = await fetch("/api/sheets/academic-calendar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const d = await res.json();
        if (!res.ok) {
          return { ok: false, error: d.error === "end_before_start" ? "วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น" : "บันทึกไม่สำเร็จ" };
        }
        setBlackouts((prev) => [...(prev ?? []), d.blackout].sort((a, b) => a.start_date.localeCompare(b.start_date)));
        return { ok: true };
      } catch {
        return { ok: false, error: "บันทึกไม่สำเร็จ" };
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const removeBlackout = useCallback(async (b: AcademicBlackout): Promise<boolean> => {
    setDeletingId(b.id);
    try {
      const res = await fetch(`/api/sheets/academic-calendar?id=${encodeURIComponent(b.id)}`, { method: "DELETE" });
      if (!res.ok) return false;
      setBlackouts((prev) => (prev ?? []).filter((x) => x.id !== b.id));
      return true;
    } finally {
      setDeletingId(null);
    }
  }, []);

  return { blackouts, loadError, saving, deletingId, addBlackout, removeBlackout };
}
