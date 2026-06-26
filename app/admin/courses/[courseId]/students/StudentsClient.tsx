"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Spinner from "@/components/Spinner";
import { IconDownload } from "@/components/icons";
import { Student, Course } from "@/types";

type SortField = "order_num" | "student_id" | "firstname" | "lastname";
type SortDir = "asc" | "desc";

interface InlineEdit { studentId: string; field: "student_id" | "firstname" | "lastname"; value: string; }

export default function StudentsClient({ courseId }: { courseId: string }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({ field: "order_num", dir: "asc" });
  const [inlineEdit, setInlineEdit] = useState<InlineEdit | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ student_id: "", firstname: "", lastname: "" });
  const [addError, setAddError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [showImport, setShowImport] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [coursesRes, stuRes] = await Promise.all([
      fetch("/api/sheets/courses"),
      fetch(`/api/sheets/session/${courseId}`).catch(() => null), // won't work, use courses
    ]);
    const cd = await coursesRes.json();
    const c = (cd.courses ?? []).find((x: Course) => x.course_id === courseId);
    setCourse(c ?? null);

    if (c) {
      // Fetch students via summary endpoint
      const summRes = await fetch(`/api/sheets/summary/${courseId}`);
      const sd = await summRes.json();
      setStudents(sd.students ?? []);
    }
    setLoading(false);
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  const filteredSorted = students
    .filter((s) => {
      const q = search.toLowerCase();
      return !q || s.student_id.includes(q) || s.firstname.toLowerCase().includes(q) || s.lastname.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      const va = a[sort.field], vb = b[sort.field];
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });

  const toggleSort = (field: SortField) => {
    setSort((s) => s.field === field
      ? { field, dir: s.dir === "asc" ? "desc" : "asc" }
      : { field, dir: "asc" }
    );
  };

  const startEdit = (s: Student, field: "student_id" | "firstname" | "lastname") => {
    setInlineEdit({ studentId: s.student_id, field, value: s[field] });
  };

  const commitEdit = async () => {
    if (!inlineEdit || !course) return;
    const s = students.find((x) => x.student_id === inlineEdit.studentId);
    if (!s) { setInlineEdit(null); return; }
    if (inlineEdit.value === s[inlineEdit.field]) { setInlineEdit(null); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/sheets/students/${inlineEdit.studentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_id: courseId,
          section: course.section,
          [inlineEdit.field]: inlineEdit.value,
        }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error ?? "Error"); return; }
      setStudents((prev) => prev.map((x) =>
        x.student_id === inlineEdit.studentId
          ? { ...x, [inlineEdit.field]: inlineEdit.value, ...(inlineEdit.field === "student_id" ? { student_id: inlineEdit.value } : {}) }
          : x
      ));
    } finally {
      setSaving(false);
      setInlineEdit(null);
    }
  };

  const handleAddStudent = async () => {
    if (!course) return;
    setAddError("");
    if (!/^\d{9}$/.test(addForm.student_id)) { setAddError("Student ID must be 9 digits"); return; }
    if (!addForm.firstname.trim()) { setAddError("First name required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/sheets/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...addForm, course_id: courseId, section: course.section }),
      });
      const d = await res.json();
      if (!res.ok) { setAddError(d.error ?? "Error"); return; }
      setStudents((prev) => [...prev, d.student]);
      setShowAdd(false);
      setAddForm({ student_id: "", firstname: "", lastname: "" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !course) return;
    if (deleteConfirm !== deleteTarget.student_id) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/sheets/students/${deleteTarget.student_id}?course_id=${courseId}&section=${course.section}`,
        { method: "DELETE" }
      );
      if (!res.ok) { const d = await res.json(); alert(d.error ?? "Error"); return; }
      setStudents((prev) => prev.filter((s) => s.student_id !== deleteTarget.student_id));
      setDeleteTarget(null);
      setDeleteConfirm("");
    } finally {
      setDeleting(false);
    }
  };

  const exportCsv = () => {
    const header = ["#", "Student ID", "First Name", "Last Name"];
    const rows = filteredSorted.map((s) => [s.order_num, s.student_id, s.firstname, s.lastname]);
    const csv = "﻿" + [header, ...rows].map((r) => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `students_${courseId}.csv`;
    a.click();
  };

  const SortTh = ({ field, label }: { field: SortField; label: string }) => (
    <th
      className="px-3 py-2.5 text-left text-[11px] font-medium cursor-pointer select-none"
      style={{ color: "#5F5E5A" }}
      onClick={() => toggleSort(field)}
    >
      {label} {sort.field === field ? (sort.dir === "asc" ? "↑" : "↓") : ""}
    </th>
  );

  if (loading) return (
    <div className="flex justify-center py-20"><Spinner className="h-8 w-8 text-[#185FA5]" /></div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[13px] text-gray-500 mb-1">
            <Link href="/admin" style={{ color: "#185FA5" }}>Courses</Link>
            <span>›</span>
            <span>{course?.title ?? courseId}</span>
          </div>
          <h1 className="text-[18px] font-medium text-gray-900">
            {course?.title ?? courseId}
            <span className="text-[13px] font-normal text-gray-500 ml-2">
              Sec.{course?.section} · {students.length} นักศึกษา
            </span>
          </h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowAdd(true)} className="btn-primary text-[13px]" style={{ minHeight: 36 }}>
            + Add Student
          </button>
          <button onClick={() => setShowImport(true)} className="btn-outline text-[13px]" style={{ minHeight: 36 }}>
            Import Update
          </button>
          <button onClick={exportCsv} className="btn-outline text-[13px]" style={{ minHeight: 36 }}>
            <IconDownload size={13} /> Export
          </button>
        </div>
      </div>

      {/* Search */}
      <input
        className="input text-[13px] max-w-xs"
        placeholder="Search by name or student ID..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Table */}
      <div className="overflow-x-auto rounded-xl" style={{ border: "0.5px solid rgba(0,0,0,0.1)" }}>
        <table className="min-w-full text-[13px] border-collapse bg-white">
          <thead>
            <tr style={{ borderBottom: "0.5px solid rgba(0,0,0,0.10)", backgroundColor: "#f9fafb" }}>
              <SortTh field="order_num" label="#" />
              <SortTh field="student_id" label="Student ID" />
              <SortTh field="firstname" label="First Name" />
              <SortTh field="lastname" label="Last Name" />
              <th className="px-3 py-2.5 text-right text-[11px] font-medium" style={{ color: "#5F5E5A" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSorted.map((s) => (
              <tr key={s.student_id} style={{ borderBottom: "0.5px solid rgba(0,0,0,0.06)" }}>
                <td className="px-3 py-2 text-gray-400 text-[11px]">{s.order_num}</td>
                {(["student_id", "firstname", "lastname"] as const).map((f) => (
                  <td key={f} className="px-3 py-2">
                    {inlineEdit?.studentId === s.student_id && inlineEdit.field === f ? (
                      <input
                        autoFocus
                        className="input text-[13px] py-0.5 h-8"
                        value={inlineEdit.value}
                        onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEdit();
                          if (e.key === "Escape") setInlineEdit(null);
                        }}
                      />
                    ) : (
                      <span
                        className="cursor-pointer hover:underline"
                        style={{ fontFamily: f === "student_id" ? "monospace" : undefined }}
                        onClick={() => startEdit(s, f)}
                        title="Click to edit"
                      >
                        {s[f]}
                      </span>
                    )}
                  </td>
                ))}
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => { setDeleteTarget(s); setDeleteConfirm(""); }}
                    className="text-[11px] px-2 py-1 rounded transition-colors"
                    style={{ color: "#A32D2D", background: "none", border: "none", cursor: "pointer" }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {filteredSorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-gray-400 text-[13px]">
                  {search ? "No students match your search" : "No students yet"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {saving && (
        <div className="flex items-center gap-2 text-[13px] text-gray-500">
          <Spinner className="h-4 w-4" /> Saving...
        </div>
      )}

      {/* Add student modal */}
      {showAdd && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
          <div className="card max-w-sm w-full space-y-4">
            <h3 className="font-medium text-gray-900">Add Student</h3>
            <div className="space-y-3">
              {(["student_id", "firstname", "lastname"] as const).map((f) => (
                <div key={f}>
                  <label className="block text-[13px] font-medium text-gray-700 mb-1 capitalize">
                    {f.replace("_", " ")} {f === "student_id" || f === "firstname" ? "*" : ""}
                  </label>
                  <input
                    className="input text-[13px]"
                    value={addForm[f]}
                    onChange={(e) => setAddForm((a) => ({ ...a, [f]: e.target.value }))}
                    placeholder={f === "student_id" ? "9 digits" : ""}
                    maxLength={f === "student_id" ? 9 : undefined}
                  />
                </div>
              ))}
              {addError && <p className="text-[12px]" style={{ color: "#A32D2D" }}>{addError}</p>}
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowAdd(false); setAddError(""); }} className="btn-outline flex-1">Cancel</button>
              <button
                onClick={handleAddStudent}
                disabled={saving}
                className="btn-primary flex-1"
              >
                {saving ? <Spinner className="h-4 w-4" /> : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
          <div className="card max-w-sm w-full space-y-4">
            <h3 className="font-medium text-gray-900">ลบนักศึกษา</h3>
            <div className="rounded-lg px-3 py-2 text-[13px]" style={{ backgroundColor: "#FCEBEB" }}>
              <p className="font-medium" style={{ color: "#A32D2D" }}>
                ลบ {deleteTarget.firstname} {deleteTarget.lastname} ออกจากวิชานี้?
              </p>
              <p className="mt-1" style={{ color: "#A32D2D" }}>
                ข้อมูลการเช็คชื่อทั้งหมดของนักศึกษาคนนี้จะถูกลบด้วย
              </p>
              <p className="mt-1 text-[11px]" style={{ color: "#A32D2D" }}>การดำเนินการนี้ไม่สามารถย้อนกลับได้</p>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-gray-700 mb-1">
                พิมพ์รหัสนักศึกษา <strong>{deleteTarget.student_id}</strong> เพื่อยืนยัน
              </label>
              <input
                className="input text-[13px] font-mono"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={deleteTarget.student_id}
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setDeleteTarget(null); setDeleteConfirm(""); }} className="btn-outline flex-1">Cancel</button>
              <button
                onClick={handleDelete}
                disabled={deleting || deleteConfirm !== deleteTarget.student_id}
                className="btn-danger flex-1"
              >
                {deleting ? <Spinner className="h-4 w-4" /> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Update modal */}
      {showImport && course && (
        <ImportUpdateModal
          courseId={courseId}
          section={course.section}
          onClose={() => setShowImport(false)}
          onDone={() => { setShowImport(false); load(); }}
        />
      )}

      {/* Hidden file input */}
      <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="sr-only" />
    </div>
  );
}

function ImportUpdateModal({
  courseId, section, onClose, onDone,
}: {
  courseId: string; section: string; onClose: () => void; onDone: () => void;
}) {
  const [mode, setMode] = useState<"add_new" | "update_existing" | "add_update" | "replace">("add_update");
  const [file, setFile] = useState<File | null>(null);
  const [replaceConfirm, setReplaceConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!file) { setError("Please select a file"); return; }
    if (mode === "replace" && replaceConfirm !== "REPLACE") { setError("Type REPLACE to confirm"); return; }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("course_id", courseId);
      formData.append("section", section);
      formData.append("mode", mode);
      const res = await fetch("/api/sheets/import/update", { method: "POST", body: formData });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Error"); return; }
      onDone();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
      <div className="card max-w-md w-full space-y-4">
        <h3 className="font-medium text-gray-900">Import Update</h3>
        <div className="space-y-2">
          {([
            ["add_new", "Add new students only (skip existing IDs)"],
            ["update_existing", "Update existing students only (skip new IDs)"],
            ["add_update", "Add new + update existing (Recommended)"],
            ["replace", "Replace all (delete current, import fresh)"],
          ] as const).map(([v, label]) => (
            <label key={v} className="flex items-start gap-2 cursor-pointer p-2 rounded-lg hover:bg-gray-50">
              <input
                type="radio"
                name="mode"
                value={v}
                checked={mode === v}
                onChange={() => setMode(v)}
                className="mt-0.5"
              />
              <span className="text-[13px]" style={{ color: v === "replace" ? "#A32D2D" : "#374151" }}>{label}</span>
            </label>
          ))}
        </div>
        <label className="block">
          <span className="text-[13px] font-medium text-gray-700">Select file (.xlsx, .csv)</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="mt-1 block text-[13px]"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {mode === "replace" && (
          <div>
            <label className="block text-[13px] font-medium mb-1" style={{ color: "#A32D2D" }}>
              Type <strong>REPLACE</strong> to confirm deletion of all current students
            </label>
            <input
              className="input text-[13px] font-mono"
              value={replaceConfirm}
              onChange={(e) => setReplaceConfirm(e.target.value)}
              placeholder="REPLACE"
            />
          </div>
        )}
        {error && <p className="text-[12px]" style={{ color: "#A32D2D" }}>{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-outline flex-1">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !file}
            className={mode === "replace" ? "btn-danger flex-1" : "btn-primary flex-1"}
          >
            {submitting ? <Spinner className="h-4 w-4" /> : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
