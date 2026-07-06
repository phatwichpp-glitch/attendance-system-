"use client";
import { useState, useEffect } from "react";
import Spinner from "@/components/Spinner";
import { AuditLog } from "@/types";

// The API additively joins attendance entries against the attendance/sessions
// sheets server-side (see app/api/sheets/audit/route.ts) so a teacher can see
// who a record belongs to instead of a raw entity_id.
type EnrichedAuditLog = AuditLog & {
  student_id?: string;
  student_name?: string;
  course_id?: string;
  session_date?: string;
};

const ENTITY_COLORS: Record<string, string> = {
  student: "#185FA5",
  attendance: "#3B6D11",
  course: "#854F0B",
  session: "#5F5E5A",
};

const ACTION_COLORS: Record<string, string> = {
  create: "#3B6D11",
  update: "#185FA5",
  delete: "#A32D2D",
};

export default function AuditClient() {
  const [entries, setEntries] = useState<EnrichedAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ entity_type: "", action: "", from: "", to: "", student: "" });
  const [studentInput, setStudentInput] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  // Debounce the student-name/ID search so every keystroke doesn't refetch.
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, student: studentInput.trim() })), 300);
    return () => clearTimeout(t);
  }, [studentInput]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.entity_type) params.set("entity_type", filters.entity_type);
    if (filters.action) params.set("action", filters.action);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.student) params.set("student", filters.student);
    setLoading(true);
    fetch(`/api/sheets/audit?${params}`)
      .then((r) => r.json())
      .then((d) => setEntries(d.entries ?? []))
      .finally(() => setLoading(false));
  }, [filters]);

  const tryParseJson = (s: string) => {
    try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-[11px] font-medium text-gray-700 mb-1">Entity Type</label>
          <select
            className="input text-[13px]"
            value={filters.entity_type}
            onChange={(e) => setFilters((f) => ({ ...f, entity_type: e.target.value }))}
          >
            <option value="">All types</option>
            {["student", "attendance", "course", "session"].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-700 mb-1">Action</label>
          <select
            className="input text-[13px]"
            value={filters.action}
            onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
          >
            <option value="">All actions</option>
            {["create", "update", "delete"].map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-700 mb-1">From</label>
          <input
            type="date"
            className="input text-[13px]"
            value={filters.from}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-700 mb-1">To</label>
          <input
            type="date"
            className="input text-[13px]"
            value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-700 mb-1">Student</label>
          <input
            type="text"
            placeholder="Name or student ID"
            className="input text-[13px]"
            value={studentInput}
            onChange={(e) => setStudentInput(e.target.value)}
          />
        </div>
        <button
          onClick={() => { setStudentInput(""); setFilters({ entity_type: "", action: "", from: "", to: "", student: "" }); }}
          className="btn-outline text-[13px]"
          style={{ minHeight: 36 }}
        >
          Clear
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner className="h-8 w-8 text-[#185FA5]" /></div>
      ) : entries.length === 0 ? (
        <div className="card text-center py-10 text-gray-400 text-[13px]">No audit log entries</div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: "0.5px solid rgba(0,0,0,0.1)" }}>
          <table className="min-w-full text-[13px] border-collapse bg-white">
            <thead>
              <tr style={{ backgroundColor: "#f9fafb", borderBottom: "0.5px solid rgba(0,0,0,0.10)" }}>
                <th className="px-3 py-2.5 text-left text-[11px] font-medium" style={{ color: "#5F5E5A" }}>Timestamp</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-medium" style={{ color: "#5F5E5A" }}>Action</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-medium" style={{ color: "#5F5E5A" }}>Type</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-medium" style={{ color: "#5F5E5A" }}>Student / Session</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-medium" style={{ color: "#5F5E5A" }}>Note</th>
                <th className="px-3 py-2.5 text-center text-[11px] font-medium" style={{ color: "#5F5E5A" }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <>
                  <tr
                    key={e.log_id}
                    style={{ borderBottom: "0.5px solid rgba(0,0,0,0.06)" }}
                  >
                    <td className="px-3 py-2 text-[11px] font-mono text-gray-500 whitespace-nowrap">
                      {new Date(e.timestamp).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: `${ACTION_COLORS[e.action] ?? "#374151"}20`,
                          color: ACTION_COLORS[e.action] ?? "#374151",
                        }}
                      >
                        {e.action}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="text-[11px] font-medium"
                        style={{ color: ENTITY_COLORS[e.entity_type] ?? "#374151" }}
                      >
                        {e.entity_type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[12px] text-gray-600 max-w-[180px] truncate">
                      {e.student_name ? (
                        <>
                          <span className="text-gray-800">{e.student_name}</span>
                          {e.session_date && <span className="text-gray-400"> · {e.session_date}</span>}
                        </>
                      ) : (
                        <span className="font-mono text-[11px]">{e.entity_id}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-gray-600 max-w-[160px] truncate">{e.note}</td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => setExpanded(expanded === e.log_id ? null : e.log_id)}
                        className="text-[11px] underline"
                        style={{ color: "#185FA5", background: "none", border: "none", cursor: "pointer" }}
                      >
                        {expanded === e.log_id ? "Hide" : "View"}
                      </button>
                    </td>
                  </tr>
                  {expanded === e.log_id && (
                    <tr key={`${e.log_id}_detail`} style={{ backgroundColor: "#f9fafb" }}>
                      <td colSpan={6} className="px-4 py-3">
                        <div className="grid grid-cols-2 gap-4 text-[11px]">
                          <div>
                            <p className="font-medium text-gray-700 mb-1">Changed From</p>
                            <pre className="rounded-lg p-2 text-[10px] overflow-x-auto" style={{ backgroundColor: "#FCEBEB", color: "#A32D2D" }}>
                              {tryParseJson(e.changed_from)}
                            </pre>
                          </div>
                          <div>
                            <p className="font-medium text-gray-700 mb-1">Changed To</p>
                            <pre className="rounded-lg p-2 text-[10px] overflow-x-auto" style={{ backgroundColor: "#EAF3DE", color: "#3B6D11" }}>
                              {tryParseJson(e.changed_to)}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-gray-400 text-center">
        {entries.length} entries — read-only
      </p>
    </div>
  );
}
