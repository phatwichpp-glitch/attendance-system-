"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Spinner from "@/components/Spinner";
import { Student, AttendanceStatus } from "@/types";

type EntryStatus = AttendanceStatus;

interface Entry { student_id: string; status: EntryStatus; }

export default function PastEntryClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [students, setStudents] = useState<Student[]>([]);
  const [entries, setEntries] = useState<Record<string, EntryStatus>>({});
  const [sessionInfo, setSessionInfo] = useState<{ course_id: string; section: string; date: string; period: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/sheets/session/${sessionId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.session) { setError("ไม่พบข้อมูลคาบ"); return; }
        setSessionInfo({
          course_id: d.session.course_id,
          section: d.session.section,
          date: d.session.date,
          period: d.session.period,
        });
        const list: Student[] = (d.students ?? []).map((s: Student & { attendance?: unknown }) => ({
          student_id: s.student_id,
          firstname: s.firstname,
          lastname: s.lastname,
          course_id: s.course_id,
          section: s.section,
          order_num: s.order_num,
        }));
        setStudents(list.sort((a, b) => a.order_num - b.order_num));
        const initial: Record<string, EntryStatus> = {};
        list.forEach((s) => { initial[s.student_id] = "present"; });
        setEntries(initial);
      })
      .catch(() => setError("โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const setAll = (status: EntryStatus) => {
    setEntries((e) => {
      const next = { ...e };
      students.forEach((s) => { next[s.student_id] = status; });
      return next;
    });
  };

  const handleSave = async () => {
    if (!sessionInfo) return;
    setSubmitting(true);
    try {
      const body: { session_id: string; course_id: string; section: string; entries: Entry[] } = {
        session_id: sessionId,
        course_id: sessionInfo.course_id,
        section: sessionInfo.section,
        entries: students.map((s) => ({ student_id: s.student_id, status: entries[s.student_id] ?? "present" })),
      };
      const res = await fetch("/api/sheets/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("บันทึกไม่สำเร็จ");
      router.push(`/admin/summary/${sessionInfo.course_id}?section=${encodeURIComponent(sessionInfo.section)}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="card flex items-center gap-2 text-gray-500">
      <Spinner className="h-5 w-5" /> กำลังโหลด...
    </div>
  );
  if (error) return <div className="rounded-lg px-4 py-3 text-[13px]" style={{ backgroundColor: "#FCEBEB", color: "#A32D2D" }}>{error}</div>;

  const counts = { present: 0, late: 0, absent: 0 };
  Object.values(entries).forEach((s) => { if (s in counts) counts[s as keyof typeof counts]++; });

  return (
    <div className="space-y-4">
      {sessionInfo && (
        <div className="card text-[13px] space-y-1">
          <p><span style={{ color: "#5F5E5A" }}>Course:</span> <strong>{sessionInfo.course_id}</strong> · Sec.{sessionInfo.section}</p>
          <p><span style={{ color: "#5F5E5A" }}>Date:</span> {sessionInfo.date} · Period {sessionInfo.period}</p>
        </div>
      )}

      {/* Stats */}
      <div className="flex gap-2 text-[13px]">
        {(["present", "late", "absent"] as const).map((s) => (
          <div key={s} className="flex-1 rounded-lg px-3 py-2 text-center"
            style={{
              backgroundColor: s === "present" ? "#EAF3DE" : s === "late" ? "#FEF9EC" : "#FCEBEB",
              color: s === "present" ? "#3B6D11" : s === "late" ? "#854F0B" : "#A32D2D",
            }}>
            <p className="font-bold text-lg">{counts[s]}</p>
            <p className="text-[11px] capitalize">{s}</p>
          </div>
        ))}
      </div>

      {/* Bulk actions */}
      <div className="flex gap-2">
        {(["present", "late", "absent"] as EntryStatus[]).map((s) => (
          <button key={s} onClick={() => setAll(s)} className="btn-outline text-[12px] flex-1 capitalize"
            style={{ minHeight: 36 }}>
            All {s}
          </button>
        ))}
      </div>

      {/* Student list */}
      <div className="card divide-y divide-gray-100">
        {students.map((s) => (
          <div key={s.student_id} className="flex items-center gap-3 py-3">
            <div className="text-[11px] text-gray-400 w-6 text-right">{s.order_num}</div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-gray-900 truncate">{s.firstname} {s.lastname}</p>
              <p className="text-[11px] font-mono" style={{ color: "#5F5E5A" }}>{s.student_id}</p>
            </div>
            <div className="flex gap-1">
              {(["present", "late", "absent"] as EntryStatus[]).map((status) => {
                const active = entries[s.student_id] === status;
                const colors: Record<EntryStatus, { bg: string; text: string; activeBg: string }> = {
                  present: { bg: "#f3f4f6", text: "#374151", activeBg: "#3B6D11" },
                  late: { bg: "#f3f4f6", text: "#374151", activeBg: "#854F0B" },
                  absent: { bg: "#f3f4f6", text: "#374151", activeBg: "#A32D2D" },
                  gps_fail: { bg: "#f3f4f6", text: "#374151", activeBg: "#374151" },
                };
                const c = colors[status];
                return (
                  <button
                    key={status}
                    onClick={() => setEntries((e) => ({ ...e, [s.student_id]: status }))}
                    className="px-2 py-1 rounded text-[11px] font-medium capitalize transition-colors"
                    style={{
                      backgroundColor: active ? c.activeBg : c.bg,
                      color: active ? "white" : c.text,
                      border: "none",
                      cursor: "pointer",
                      minWidth: 52,
                    }}
                  >
                    {status}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={submitting || students.length === 0}
        className="btn-primary w-full py-3"
      >
        {submitting ? <><Spinner className="h-5 w-5" /> กำลังบันทึก...</> : `Save Attendance (${students.length} students)`}
      </button>
    </div>
  );
}
