"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Spinner from "@/components/Spinner";
import { IconList } from "@/components/icons";
import { Course, SemesterConfig, TeachingDay } from "@/types";
import { CourseStats } from "@/lib/sheets";
import { PERIOD_STARTS } from "@/lib/period-utils";
import { todayLocalISO } from "@/lib/local-date";

type CourseStatsMap = Record<string, CourseStats>;
type ConfigMap = Record<string, SemesterConfig>;

async function fetchWithRetry(url: string, opts?: RequestInit, retries = 3): Promise<Response> {
  try {
    return await fetch(url, opts);
  } catch (e) {
    if (retries > 1) {
      await new Promise((r) => setTimeout(r, 1000 * (4 - retries)));
      return fetchWithRetry(url, opts, retries - 1);
    }
    throw e;
  }
}

function MenuItem({
  href, children, onClick, danger,
}: {
  href?: string; children: React.ReactNode; onClick?: () => void; danger?: boolean;
}) {
  const cls = "block w-full text-left px-3 py-2 text-[13px] transition-colors hover:bg-gray-50";
  const style = { color: danger ? "#A32D2D" : "#374151", background: "none", border: "none", cursor: "pointer" };

  if (href) {
    return (
      <Link href={href} onClick={onClick} className={cls} style={{ color: style.color }}>
        {children}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={cls} style={style}>
      {children}
    </button>
  );
}

export default function CourseList() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [stats, setStats] = useState<CourseStatsMap>({});
  const [configs, setConfigs] = useState<ConfigMap>({});
  const [quickOpening, setQuickOpening] = useState<string | null>(null);
  const [quickError, setQuickError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Course | null>(null);
  const [editForm, setEditForm] = useState({ title: "", lecturer: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [showCreateCourse, setShowCreateCourse] = useState(false);
  const [createForm, setCreateForm] = useState({ course_id: "", title: "", section: "", lecturer: "" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);

  const loadCourses = () =>
    fetchWithRetry("/api/sheets/courses")
      .then((r) => r.json())
      .then((d) => { setCourses(d.courses ?? []); setStats(d.stats ?? {}); setConfigs(d.configs ?? {}); });

  useEffect(() => {
    fetchWithRetry("/api/sheets/init", { method: "POST" })
      .then(() => loadCourses())
      .catch(() => setError("โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  const handleCreateCourse = async () => {
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/sheets/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...createForm, students: [] }),
      });
      if (!res.ok) throw new Error();
      await loadCourses();
      setShowCreateCourse(false);
      setCreateForm({ course_id: "", title: "", section: "", lecturer: "" });
    } catch {
      setCreateError("สร้างวิชาไม่สำเร็จ — กรุณาลองใหม่");
    } finally {
      setCreating(false);
    }
  };

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // ── Today's schedule + quick open ─────────────────────────────────────────
  const todayDow = new Date().getDay();

  const todayEntryFor = (key: string): TeachingDay | null =>
    configs[key]?.teaching_schedule.find((t) => t.day === todayDow) ?? null;

  /** Quick open needs a pinned classroom location + today being a teaching day. */
  const canQuickOpen = (key: string): boolean => {
    const cfg = configs[key];
    return !!cfg && !!todayEntryFor(key) && cfg.default_lat != null && cfg.default_lng != null;
  };

  /** One-tap open using the semester config's defaults and pinned GPS location —
   *  same values the auto-open scheduler would use, no form and no GPS wait. */
  const quickOpen = async (c: Course) => {
    const key = `${c.course_id}__${c.section}`;
    const cfg = configs[key];
    const td = todayEntryFor(key);
    if (!cfg || !td || cfg.default_lat == null || cfg.default_lng == null) return;
    setQuickOpening(key);
    setQuickError("");
    try {
      const pc = td.period_count ?? 1;
      const res = await fetch("/api/sheets/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_id: c.course_id,
          section: c.section,
          period: td.period,
          lat: cfg.default_lat,
          lng: cfg.default_lng,
          radius_m: cfg.default_gps_radius,
          otp_expire_min: cfg.default_otp_min,
          late_after_min: cfg.default_late_min,
          late_enabled: true,
          date: todayLocalISO(),
          is_past_session: false,
          semester_start: cfg.semester_start,
          teaching_days: cfg.teaching_schedule.map((t) => t.day),
          period_count: pc,
          check_in_mode: pc >= 2 ? (td.check_in_mode ?? "single") : undefined,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      localStorage.setItem("active_session", JSON.stringify({
        session_id: data.session.session_id,
        course_id: data.session.course_id,
        course_title: c.title,
        section: data.session.section,
        period: data.session.period,
        opened_at: new Date().toISOString(),
      }));
      router.push(`/admin/session/${data.session.session_id}`);
    } catch {
      setQuickError("เปิดคาบไม่สำเร็จ — ลองเปิดผ่านหน้า Open Session แทน");
      setQuickOpening(null);
    }
  };

  const startTimeOf = (td: TeachingDay) => td.start_time ?? PERIOD_STARTS[td.period] ?? "";

  const todayItems = courses
    .flatMap((c) => {
      const key = `${c.course_id}__${c.section}`;
      const td = todayEntryFor(key);
      return td ? [{ c, key, td, cfg: configs[key] }] : [];
    })
    .sort((a, b) => startTimeOf(a.td).localeCompare(startTimeOf(b.td)));

  const openEdit = (c: Course) => {
    setEditTarget(c);
    setEditForm({ title: c.title, lecturer: c.lecturer });
    setMenuOpen(null);
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    setEditSaving(true);
    setEditError("");
    try {
      const res = await fetch(`/api/sheets/courses/${editTarget.course_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: editTarget.section,
          title: editForm.title,
          lecturer: editForm.lecturer,
        }),
      });
      if (!res.ok) { const d = await res.json(); setEditError(d.error ?? "Edit failed"); return; }
      setCourses((prev) => prev.map((c) =>
        c.course_id === editTarget.course_id && c.section === editTarget.section
          ? { ...c, ...editForm }
          : c
      ));
      setEditTarget(null);
    } finally {
      setEditSaving(false);
    }
  };

  const openDelete = (c: Course) => {
    setDeleteTarget(c);
    setDeleteStep(1);
    setDeleteConfirm("");
    setDeleteError("");
    setMenuOpen(null);
  };

  const submitDelete = async () => {
    if (!deleteTarget) return;
    if (deleteConfirm !== deleteTarget.course_id) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch(
        `/api/sheets/courses/${deleteTarget.course_id}?section=${deleteTarget.section}`,
        { method: "DELETE" }
      );
      if (!res.ok) { const d = await res.json(); setDeleteError(d.error ?? "Delete failed"); return; }
      setCourses((prev) => prev.filter(
        (c) => !(c.course_id === deleteTarget.course_id && c.section === deleteTarget.section)
      ));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center gap-3 py-20">
      <Spinner className="h-8 w-8 text-[#185FA5]" />
      <p className="text-[12px]" style={{ color: "#9ca3af" }}>กำลังเตรียม Google Sheet ของคุณ…</p>
    </div>
  );

  if (error) return <div className="card text-center py-10 text-[#A32D2D]">{error}</div>;

  if (courses.length === 0) {
    return (
      <>
        <h1 className="text-[18px] font-medium text-gray-900">My Courses</h1>
        <div className="card text-center py-16 space-y-4">
          <IconList className="mx-auto text-gray-300" size={48} />
          <p className="text-gray-500">ยังไม่มีรายวิชา</p>
          <div className="flex items-center justify-center gap-3">
            <Link href="/admin/import" className="btn-primary">Import Students</Link>
            <button onClick={() => setShowCreateCourse(true)} className="btn-outline">
              + Create Course
            </button>
          </div>
        </div>
        <CreateCourseModal
          open={showCreateCourse}
          form={createForm}
          setForm={setCreateForm}
          onCancel={() => setShowCreateCourse(false)}
          onSubmit={handleCreateCourse}
          submitting={creating}
          error={createError}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-[18px] font-medium text-gray-900">My Courses</h1>
        <button onClick={() => setShowCreateCourse(true)} className="btn-outline text-[13px]" style={{ minHeight: 32, padding: "6px 12px" }}>
          + Create Course
        </button>
      </div>
      <CreateCourseModal
        open={showCreateCourse}
        form={createForm}
        setForm={setCreateForm}
        onCancel={() => setShowCreateCourse(false)}
        onSubmit={handleCreateCourse}
        submitting={creating}
        error={createError}
      />

      {/* Today's teaching schedule — the first thing a teacher checks each morning */}
      {todayItems.length > 0 && (
        <div className="card">
          <p className="text-[13px] font-semibold mb-1" style={{ color: "#185FA5" }}>
            Today · {new Date().toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <div className="divide-y divide-gray-50">
            {todayItems.map(({ c, key, td, cfg }) => {
              const st = stats[key];
              const start = startTimeOf(td);
              const end = td.end_time ?? "";
              return (
                <div key={key} className="flex items-center gap-3 py-2.5 flex-wrap">
                  <span className="font-mono text-[13px] w-24 shrink-0" style={{ color: "#5F5E5A" }}>
                    {start}{end && `–${end}`}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900 truncate">{c.title}</p>
                    <p className="text-[11px] text-gray-400">
                      {c.course_id} · Sec.{c.section}
                      {cfg.auto_open_enabled && !st?.open_session_id && (
                        <span className="ml-2" style={{ color: "#3B6D11" }}>● เปิดอัตโนมัติเวลา {start}</span>
                      )}
                    </p>
                  </div>
                  {st?.open_session_id ? (
                    <Link
                      href={`/admin/session/${st.open_session_id}`}
                      className="text-[12px] px-3 rounded-lg font-medium flex items-center gap-1.5 shrink-0"
                      style={{ minHeight: 32, backgroundColor: "#DCFCE7", color: "#166534", border: "1px solid #86EFAC" }}
                    >
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      กำลังเปิด — เข้าดู
                    </Link>
                  ) : canQuickOpen(key) ? (
                    <button
                      onClick={() => quickOpen(c)}
                      disabled={quickOpening !== null}
                      className="btn-primary text-[12px] px-3 shrink-0"
                      style={{ minHeight: 32 }}
                    >
                      {quickOpening === key ? <Spinner className="h-3.5 w-3.5" /> : "Quick Open"}
                    </button>
                  ) : (
                    <Link
                      href={`/admin/setup?course_id=${c.course_id}&section=${c.section}`}
                      className="btn-outline text-[12px] px-3 shrink-0"
                      style={{ minHeight: 32 }}
                    >
                      Open Session
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
          {quickError && (
            <p className="text-[12px] mt-2 rounded-lg px-3 py-2" style={{ backgroundColor: "#FCEBEB", color: "#A32D2D" }}>
              {quickError}
            </p>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {courses.map((c) => {
          const key = `${c.course_id}__${c.section}`;
          const st = stats[key];
          const isMenuOpen = menuOpen === key;

          return (
            <div
              key={key}
              className="card"
              style={{
                transition: "border-color 0.15s",
                borderColor: st?.open_session_id ? "#86EFAC" : "rgba(0,0,0,0.1)",
                backgroundColor: st?.open_session_id ? "#F0FDF4" : undefined,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = st?.open_session_id ? "#4ADE80" : "#185FA5")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = st?.open_session_id ? "#86EFAC" : "rgba(0,0,0,0.1)")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-[11px]" style={{ color: "#5F5E5A" }}>{c.course_id}</p>
                    {st?.open_session_id && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{ backgroundColor: "#DCFCE7", color: "#166534" }}>
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        กำลังเปิด
                      </span>
                    )}
                  </div>
                  <h3 className="font-medium text-gray-900 truncate mt-0.5">{c.title}</h3>
                  <p className="text-[13px] text-gray-500 mt-1">
                    Sec.{c.section} · Year {c.year} Sem {c.semester}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{c.lecturer}</p>

                  {/* Stats row */}
                  {st && (
                    <div className="flex gap-3 mt-2 text-[11px]">
                      <span style={{ color: "#185FA5" }}>{st.student_count} students</span>
                      <span className="text-gray-300">·</span>
                      <span style={{ color: "#5F5E5A" }}>{st.session_count} sessions</span>
                      {st.last_session_date && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span style={{ color: "#5F5E5A" }}>Last: {st.last_session_date}</span>
                        </>
                      )}
                      {st.avg_attendance_pct > 0 && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span style={{ color: st.avg_attendance_pct >= 80 ? "#3B6D11" : "#A32D2D" }}>
                            {st.avg_attendance_pct}% avg
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 flex-shrink-0 items-end">
                  <div className="flex gap-1.5 items-center">
                    {st?.open_session_id ? (
                      <Link
                        href={`/admin/session/${st.open_session_id}`}
                        className="text-[13px] px-3 rounded-lg font-medium transition-colors flex items-center gap-1.5"
                        style={{ minHeight: 36, backgroundColor: "#DCFCE7", color: "#166534", border: "1px solid #86EFAC" }}
                      >
                        <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        View Active Session
                      </Link>
                    ) : canQuickOpen(key) ? (
                      <button
                        onClick={() => quickOpen(c)}
                        disabled={quickOpening !== null}
                        className="btn-primary text-[13px] px-3"
                        style={{ minHeight: 36 }}
                        title="เปิดด้วยค่าจาก Semester Settings + หมุดห้องเรียนที่ปักไว้ — ไม่ต้องรอ GPS"
                      >
                        {quickOpening === key ? <Spinner className="h-4 w-4" /> : "Quick Open"}
                      </button>
                    ) : (
                      <Link
                        href={`/admin/setup?course_id=${c.course_id}&section=${c.section}`}
                        className="btn-primary text-[13px] px-3"
                        style={{ minHeight: 36 }}
                      >
                        Open Session
                      </Link>
                    )}

                    {/* ⋯ menu */}
                    <div className="relative" ref={isMenuOpen ? menuRef : undefined}>
                      <button
                        onClick={() => setMenuOpen(isMenuOpen ? null : key)}
                        className="rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                        style={{ width: 32, height: 36, border: "none", background: "none", cursor: "pointer", fontSize: 18, lineHeight: 1 }}
                        title="More options"
                      >
                        ⋯
                      </button>
                      {isMenuOpen && (
                        <div
                          className="absolute right-0 top-full mt-1 rounded-xl shadow-lg z-20 py-1 min-w-[168px]"
                          style={{ backgroundColor: "white", border: "0.5px solid rgba(0,0,0,0.12)" }}
                        >
                          {st?.open_session_id && (
                            <>
                              <MenuItem
                                href={`/admin/session/${st.open_session_id}`}
                                onClick={() => setMenuOpen(null)}
                              >
                                View Active Session
                              </MenuItem>
                              <div style={{ height: "0.5px", backgroundColor: "rgba(0,0,0,0.08)", margin: "4px 0" }} />
                            </>
                          )}
                          <MenuItem
                            href={`/admin/summary/${c.course_id}?section=${encodeURIComponent(c.section)}`}
                            onClick={() => setMenuOpen(null)}
                          >
                            View Summary
                          </MenuItem>
                          <MenuItem
                            href={`/admin/courses/${c.course_id}/students?section=${encodeURIComponent(c.section)}`}
                            onClick={() => setMenuOpen(null)}
                          >
                            View Students
                          </MenuItem>
                          <MenuItem
                            href={`/admin/courses/${c.course_id}/semester?section=${encodeURIComponent(c.section)}`}
                            onClick={() => setMenuOpen(null)}
                          >
                            Semester Settings
                          </MenuItem>
                          <MenuItem
                            href={`/projector/course/${c.course_id}?section=${c.section}`}
                            onClick={() => setMenuOpen(null)}
                          >
                            Classroom Display
                          </MenuItem>
                          <MenuItem onClick={() => openEdit(c)}>
                            Edit Course Info
                          </MenuItem>
                          <div style={{ height: "0.5px", backgroundColor: "rgba(0,0,0,0.08)", margin: "4px 0" }} />
                          <MenuItem danger onClick={() => openDelete(c)}>
                            Delete Course
                          </MenuItem>
                        </div>
                      )}
                    </div>
                  </div>

                  {st?.open_session_id ? (
                    <Link
                      href={`/admin/setup?course_id=${c.course_id}&section=${c.section}`}
                      className="text-[13px] px-3 w-full text-center rounded-lg transition-colors"
                      style={{ minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280", border: "1px solid #d1d5db", backgroundColor: "white" }}
                    >
                      Open Another Session
                    </Link>
                  ) : canQuickOpen(key) ? (
                    <Link
                      href={`/admin/setup?course_id=${c.course_id}&section=${c.section}`}
                      className="btn-outline text-[13px] px-3 w-full text-center"
                      style={{ minHeight: 36 }}
                    >
                      Open Session
                    </Link>
                  ) : (
                    <Link
                      href={`/admin/summary/${c.course_id}?section=${encodeURIComponent(c.section)}`}
                      className="btn-outline text-[13px] px-3 w-full text-center"
                      style={{ minHeight: 36 }}
                    >
                      Summary
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit course modal */}
      {editTarget && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
          <div className="card max-w-sm w-full space-y-4">
            <h3 className="font-medium text-gray-900">Edit Course Info</h3>
            <div className="text-[12px] text-gray-500 space-y-1">
              <p>Course ID: <strong className="font-mono text-gray-800">{editTarget.course_id}</strong></p>
              <p>Section: <strong className="text-gray-800">{editTarget.section}</strong></p>
            </div>
            {editError && (
              <div className="rounded-lg px-3 py-2 text-[13px]" style={{ backgroundColor: "#FCEBEB", color: "#A32D2D" }}>
                {editError}
              </div>
            )}
            <div className="space-y-3">
              {(["title", "lecturer"] as const).map((f) => (
                <div key={f}>
                  <label className="block text-[13px] font-medium text-gray-700 mb-1 capitalize">{f}</label>
                  <input
                    className="input text-[13px]"
                    value={editForm[f]}
                    onChange={(e) => setEditForm((x) => ({ ...x, [f]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setEditTarget(null)} className="btn-outline flex-1">Cancel</button>
              <button onClick={submitEdit} disabled={editSaving} className="btn-primary flex-1">
                {editSaving ? <Spinner className="h-4 w-4" /> : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete course modal */}
      {deleteTarget && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
          <div className="card max-w-sm w-full space-y-4">
            {deleteStep === 1 ? (
              <>
                <h3 className="font-medium text-gray-900">ลบวิชา {deleteTarget.title}?</h3>
                <div className="rounded-lg px-3 py-2 text-[13px]" style={{ backgroundColor: "#FCEBEB", color: "#A32D2D" }}>
                  <p>วิชานี้มี <strong>{stats[`${deleteTarget.course_id}__${deleteTarget.section}`]?.student_count ?? "?"} นักศึกษา</strong>{" "}
                    และ <strong>{stats[`${deleteTarget.course_id}__${deleteTarget.section}`]?.session_count ?? "?"} session</strong> บันทึกไว้</p>
                  <p className="mt-1 text-[11px]">ข้อมูลทั้งหมดจะถูกลบ — ไม่สามารถย้อนกลับได้</p>
                </div>
                {deleteError && (
                  <div className="rounded-lg px-3 py-2 text-[13px]" style={{ backgroundColor: "#FCEBEB", color: "#A32D2D" }}>
                    {deleteError}
                  </div>
                )}
                <div className="flex gap-3">
                  <button onClick={() => setDeleteTarget(null)} className="btn-outline flex-1">Cancel</button>
                  <button onClick={() => setDeleteStep(2)} className="btn-danger flex-1">Continue →</button>
                </div>
              </>
            ) : (
              <>
                <h3 className="font-medium text-gray-900">ยืนยันการลบ</h3>
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 mb-1">
                    พิมพ์รหัสวิชา <strong>{deleteTarget.course_id}</strong> เพื่อยืนยัน
                  </label>
                  <input
                    className="input text-[13px] font-mono"
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder={deleteTarget.course_id}
                  />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setDeleteStep(1)} className="btn-outline flex-1">Back</button>
                  <button
                    onClick={submitDelete}
                    disabled={deleting || deleteConfirm !== deleteTarget.course_id}
                    className="btn-danger flex-1"
                  >
                    {deleting ? <Spinner className="h-4 w-4" /> : "Delete Course"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Previously the only way to add a course was the full roster-import wizard —
// a teacher who just wants to set up an empty course at the start of a semester
// (roster/semester config to follow later) had no path that didn't require a file.
function CreateCourseModal({
  open, form, setForm, onCancel, onSubmit, submitting, error,
}: {
  open: boolean;
  form: { course_id: string; title: string; section: string; lecturer: string };
  setForm: (f: { course_id: string; title: string; section: string; lecturer: string }) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string;
}) {
  if (!open) return null;
  const canSubmit = form.course_id.trim() && form.title.trim() && form.section.trim();

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="card max-w-sm w-full space-y-4">
        <h3 className="font-medium text-gray-900">Create Course</h3>
        <p className="text-[12px]" style={{ color: "#5F5E5A" }}>
          สร้างวิชาเปล่าไว้ก่อน แล้วค่อยเพิ่มรายชื่อนักศึกษาหรือตั้งค่าเทอมทีหลังก็ได้
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-[12px] font-medium text-gray-700 mb-1">Course ID *</label>
            <input
              className="input text-[13px]"
              value={form.course_id}
              onChange={(e) => setForm({ ...form, course_id: e.target.value })}
              placeholder="เช่น 251363"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-gray-700 mb-1">Title *</label>
            <input
              className="input text-[13px]"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-gray-700 mb-1">Section *</label>
            <input
              className="input text-[13px]"
              value={form.section}
              onChange={(e) => setForm({ ...form, section: e.target.value })}
              placeholder="เช่น 001"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-gray-700 mb-1">Lecturer</label>
            <input
              className="input text-[13px]"
              value={form.lecturer}
              onChange={(e) => setForm({ ...form, lecturer: e.target.value })}
            />
          </div>
        </div>
        {error && <p className="text-[12px]" style={{ color: "#A32D2D" }}>{error}</p>}
        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-outline flex-1">Cancel</button>
          <button onClick={onSubmit} disabled={submitting || !canSubmit} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {submitting && <Spinner className="h-4 w-4" />}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
