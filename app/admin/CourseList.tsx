"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Spinner from "@/components/Spinner";
import { IconList } from "@/components/icons";
import { Course } from "@/types";
import { CourseStats } from "@/lib/sheets";

type CourseStatsMap = Record<string, CourseStats>;

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

export default function CourseList() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [stats, setStats] = useState<CourseStatsMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Course | null>(null);
  const [editForm, setEditForm] = useState({ title: "", lecturer: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchWithRetry("/api/sheets/init", { method: "POST" })
      .then(() => fetchWithRetry("/api/sheets/courses"))
      .then((r) => r.json())
      .then((d) => { setCourses(d.courses ?? []); setStats(d.stats ?? {}); })
      .catch(() => setError("โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const openEdit = (c: Course) => {
    setEditTarget(c);
    setEditForm({ title: c.title, lecturer: c.lecturer });
    setMenuOpen(null);
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    setEditSaving(true);
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
      if (!res.ok) { const d = await res.json(); alert(d.error ?? "Error"); return; }
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
    setMenuOpen(null);
  };

  const submitDelete = async () => {
    if (!deleteTarget) return;
    if (deleteConfirm !== deleteTarget.course_id) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/sheets/courses/${deleteTarget.course_id}?section=${deleteTarget.section}`,
        { method: "DELETE" }
      );
      if (!res.ok) { const d = await res.json(); alert(d.error ?? "Error"); return; }
      setCourses((prev) => prev.filter(
        (c) => !(c.course_id === deleteTarget.course_id && c.section === deleteTarget.section)
      ));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <Spinner className="h-8 w-8 text-[#185FA5]" />
    </div>
  );

  if (error) return <div className="card text-center py-10 text-[#A32D2D]">{error}</div>;

  if (courses.length === 0) {
    return (
      <div className="card text-center py-16 space-y-4">
        <IconList className="mx-auto text-gray-300" size={48} />
        <p className="text-gray-500">ยังไม่มีรายวิชา</p>
        <Link href="/admin/import" className="btn-primary">Import Students</Link>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {courses.map((c) => {
          const key = `${c.course_id}__${c.section}`;
          const st = stats[key];
          const isMenuOpen = menuOpen === key;

          return (
            <div
              key={key}
              className="card"
              style={{ transition: "border-color 0.15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#185FA5")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[11px]" style={{ color: "#5F5E5A" }}>{c.course_id}</p>
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
                    <Link
                      href={`/admin/setup?course_id=${c.course_id}&section=${c.section}`}
                      className="btn-primary text-[13px] px-3"
                      style={{ minHeight: 36 }}
                    >
                      Open Session
                    </Link>

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
                          <MenuItem
                            href={`/admin/summary/${c.course_id}`}
                            onClick={() => setMenuOpen(null)}
                          >
                            View Summary
                          </MenuItem>
                          <MenuItem
                            href={`/admin/courses/${c.course_id}/students`}
                            onClick={() => setMenuOpen(null)}
                          >
                            View Students
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

                  <Link
                    href={`/admin/summary/${c.course_id}`}
                    className="btn-outline text-[13px] px-3 w-full text-center"
                    style={{ minHeight: 36 }}
                  >
                    Summary
                  </Link>
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

function MenuItem({
  href, children, onClick, danger,
}: {
  href?: string; children: React.ReactNode; onClick?: () => void; danger?: boolean;
}) {
  const cls = "block w-full text-left px-3 py-2 text-[13px] transition-colors hover:bg-gray-50";
  const style = { color: danger ? "#A32D2D" : "#374151", background: "none", border: "none", cursor: "pointer" };

  if (href) {
    const { default: Link } = require("next/link");
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
