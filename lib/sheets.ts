import { google } from "googleapis";
import {
  Course,
  Student,
  Session,
  AttendanceRecord,
  AttendanceStatus,
  SemesterConfig,
  TeachingDay,
} from "@/types";
import { generateOTP } from "@/lib/otp";

function makeAuth(accessToken: string) {
  const oauth = new google.auth.OAuth2();
  oauth.setCredentials({ access_token: accessToken });
  return oauth;
}

export function getSheetsClient(accessToken: string) {
  return google.sheets({ version: "v4", auth: makeAuth(accessToken) });
}

export function getDriveClient(accessToken: string) {
  return google.drive({ version: "v3", auth: makeAuth(accessToken) });
}

// ─── Spreadsheet bootstrap ────────────────────────────────────────────────────

export async function initializeSpreadsheet(
  accessToken: string
): Promise<string> {
  const drive = getDriveClient(accessToken);
  const res = await drive.files.list({
    q: "name='AttendanceDB' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    fields: "files(id,name)",
    spaces: "drive",
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id!;
  }

  const sheets = getSheetsClient(accessToken);
  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: "AttendanceDB" },
      sheets: [
        { properties: { title: "courses" } },
        { properties: { title: "students" } },
        { properties: { title: "sessions" } },
        { properties: { title: "attendance" } },
        { properties: { title: "semester_config" } },
      ],
    },
  });

  const id = created.data.spreadsheetId!;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        {
          range: "courses!A1:F1",
          values: [["course_id", "title", "section", "semester", "year", "lecturer"]],
        },
        {
          range: "students!A1:F1",
          values: [["student_id", "firstname", "lastname", "course_id", "section", "order_num"]],
        },
        {
          range: "sessions!A1:U1",
          values: [[
            "session_id", "course_id", "section", "period", "date", "otp",
            "lat", "lng", "radius_m", "late_after_min", "otp_expire_min",
            "opened_at", "closed_at", "week_number", "week_label", "is_past_session",
            "period_count", "period_end", "check_in_mode", "linked_session_id", "part_number",
          ]],
        },
        {
          range: "attendance!A1:V1",
          values: [[
            "attendance_id", "session_id", "course_id", "student_id", "firstname", "lastname",
            "status", "gps_pass", "distance_m", "checked_at", "overridden", "overridden_at",
            "device_fingerprint", "edited_at", "edited_from", "edited_to", "edit_note", "is_manual_entry",
            "flagged", "flagged_at", "action_taken", "action_taken_at",
          ]],
        },
        {
          range: "semester_config!A1:K1",
          values: [[
            "course_id", "section", "semester_start", "total_weeks", "teaching_schedule",
            "default_gps_radius", "default_otp_min", "default_late_min",
            "attendance_threshold", "created_at", "updated_at",
          ]],
        },
      ],
    },
  });

  return id;
}

// ─── Semester Config ──────────────────────────────────────────────────────────

async function ensureSemesterConfigSheet(
  accessToken: string,
  spreadsheetId: string
): Promise<void> {
  const sheets = getSheetsClient(accessToken);
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });
  const exists = (meta.data.sheets ?? []).some(
    (s) => s.properties?.title === "semester_config"
  );
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: "semester_config" } } }],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "semester_config!A1:K1",
      valueInputOption: "RAW",
      requestBody: {
        values: [[
          "course_id", "section", "semester_start", "total_weeks", "teaching_schedule",
          "default_gps_radius", "default_otp_min", "default_late_min",
          "attendance_threshold", "created_at", "updated_at",
        ]],
      },
    });
  }
}

export async function getSemesterConfig(
  accessToken: string,
  spreadsheetId: string,
  courseId: string,
  section?: string
): Promise<SemesterConfig | null> {
  await ensureSemesterConfigSheet(accessToken, spreadsheetId);
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "semester_config!A2:K",
  });
  const rows = res.data.values ?? [];
  const row = section
    ? rows.find((r) => r[0] === courseId && r[1] === section)
    : rows.find((r) => r[0] === courseId);
  if (!row) return null;
  return rowToSemesterConfig(row);
}

export async function upsertSemesterConfig(
  accessToken: string,
  spreadsheetId: string,
  config: SemesterConfig
): Promise<void> {
  await ensureSemesterConfigSheet(accessToken, spreadsheetId);
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "semester_config!A2:K",
  });
  const rows = res.data.values ?? [];
  const idx = rows.findIndex(
    (r) => r[0] === config.course_id && r[1] === config.section
  );
  const now = new Date().toISOString();
  const row = [
    config.course_id,
    config.section,
    config.semester_start,
    config.total_weeks,
    JSON.stringify(config.teaching_schedule),
    config.default_gps_radius,
    config.default_otp_min,
    config.default_late_min,
    config.attendance_threshold,
    idx === -1 ? now : (config.created_at || now),
    now,
  ];

  if (idx === -1) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "semester_config!A:K",
      valueInputOption: "RAW",
      requestBody: { values: [row] },
    });
  } else {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `semester_config!A${idx + 2}:K${idx + 2}`,
      valueInputOption: "RAW",
      requestBody: { values: [row] },
    });
  }
}

function rowToSemesterConfig(r: string[]): SemesterConfig {
  let schedule: TeachingDay[] = [];
  try { schedule = JSON.parse(r[4] ?? "[]"); } catch { /* empty */ }
  return {
    course_id: r[0] ?? "",
    section: r[1] ?? "",
    semester_start: r[2] ?? "",
    total_weeks: parseInt(r[3] ?? "15", 10),
    teaching_schedule: schedule,
    default_gps_radius: parseInt(r[5] ?? "200", 10),
    default_otp_min: parseInt(r[6] ?? "15", 10),
    default_late_min: parseInt(r[7] ?? "15", 10),
    attendance_threshold: parseInt(r[8] ?? "80", 10),
    created_at: r[9] ?? "",
    updated_at: r[10] ?? "",
  };
}

// ─── Courses ──────────────────────────────────────────────────────────────────

export async function getCourses(
  accessToken: string,
  spreadsheetId: string
): Promise<Course[]> {
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "courses!A2:F",
  });
  return (res.data.values ?? []).map((r) => ({
    course_id: r[0] ?? "",
    title: r[1] ?? "",
    section: r[2] ?? "",
    semester: r[3] ?? "",
    year: r[4] ?? "",
    lecturer: r[5] ?? "",
  }));
}

export async function upsertCourse(
  accessToken: string,
  spreadsheetId: string,
  course: Course
): Promise<void> {
  const sheets = getSheetsClient(accessToken);
  const existing = await getCourses(accessToken, spreadsheetId);
  const idx = existing.findIndex(
    (c) => c.course_id === course.course_id && c.section === course.section
  );
  const row = [
    course.course_id, course.title, course.section,
    course.semester, course.year, course.lecturer,
  ];

  if (idx === -1) {
    await sheets.spreadsheets.values.append({
      spreadsheetId, range: "courses!A:F",
      valueInputOption: "RAW", requestBody: { values: [row] },
    });
  } else {
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: `courses!A${idx + 2}:F${idx + 2}`,
      valueInputOption: "RAW", requestBody: { values: [row] },
    });
  }
}

// ─── Students ─────────────────────────────────────────────────────────────────

export async function getStudents(
  accessToken: string,
  spreadsheetId: string,
  courseId: string,
  section?: string
): Promise<Student[]> {
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "students!A2:F",
  });
  return (res.data.values ?? [])
    .map((r) => ({
      student_id: r[0] ?? "",
      firstname: r[1] ?? "",
      lastname: r[2] ?? "",
      course_id: r[3] ?? "",
      section: r[4] ?? "",
      order_num: parseInt(r[5] ?? "0", 10),
    }))
    .filter(
      (s) => s.course_id === courseId && (!section || s.section === section)
    );
}

export async function upsertStudents(
  accessToken: string,
  spreadsheetId: string,
  courseId: string,
  section: string,
  students: Student[]
): Promise<void> {
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId, range: "students!A2:F",
  });
  const existing = res.data.values ?? [];
  const kept = existing.filter((r) => !(r[3] === courseId && r[4] === section));
  const newRows = students.map((s) => [
    s.student_id, s.firstname, s.lastname, s.course_id, s.section, s.order_num,
  ]);
  const allRows = [...kept, ...newRows];

  await sheets.spreadsheets.values.clear({ spreadsheetId, range: "students!A2:F" });
  if (allRows.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: "students!A2:F",
      valueInputOption: "RAW", requestBody: { values: allRows },
    });
  }
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function createSession(
  accessToken: string,
  spreadsheetId: string,
  session: Session
): Promise<void> {
  const sheets = getSheetsClient(accessToken);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "sessions!A:U",
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        session.session_id, session.course_id, session.section, session.period,
        session.date, session.otp, session.lat, session.lng,
        session.radius_m, session.late_after_min, session.otp_expire_min,
        session.opened_at, session.closed_at,
        session.week_number ?? "",
        session.week_label ?? "",
        session.is_past_session ? "TRUE" : "FALSE",
        session.period_count ?? 1,
        session.period_end ?? "",
        session.check_in_mode ?? "",
        session.linked_session_id ?? "",
        session.part_number ?? "",
      ]],
    },
  });
}

export async function getAllSessions(
  accessToken: string,
  spreadsheetId: string
): Promise<Session[]> {
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId, range: "sessions!A2:U",
  });
  return (res.data.values ?? []).map(rowToSession);
}

export async function getSessionById(
  accessToken: string,
  spreadsheetId: string,
  sessionId: string
): Promise<Session | null> {
  const all = await getAllSessions(accessToken, spreadsheetId);
  return all.find((s) => s.session_id === sessionId) ?? null;
}

export async function closeSessionInSheet(
  accessToken: string,
  spreadsheetId: string,
  sessionId: string,
  closedAt: string
): Promise<void> {
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId, range: "sessions!A2:U",
  });
  const rows = res.data.values ?? [];
  const idx = rows.findIndex((r) => r[0] === sessionId);
  if (idx === -1) throw new Error("Session not found");

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `sessions!M${idx + 2}`,
    valueInputOption: "RAW",
    requestBody: { values: [[closedAt]] },
  });
}

function rowToSession(r: string[]): Session {
  return {
    session_id: r[0] ?? "",
    course_id: r[1] ?? "",
    section: r[2] ?? "",
    period: r[3] ?? "",
    date: r[4] ?? "",
    otp: r[5] ?? "",
    lat: parseFloat(r[6] ?? "0"),
    lng: parseFloat(r[7] ?? "0"),
    radius_m: parseInt(r[8] ?? "0", 10),
    late_after_min: parseInt(r[9] ?? "0", 10),
    otp_expire_min: parseInt(r[10] ?? "0", 10),
    opened_at: r[11] ?? "",
    closed_at: r[12] ?? "",
    week_number: r[13] ? parseInt(r[13], 10) : undefined,
    week_label: r[14] || undefined,
    is_past_session: r[15] === "TRUE",
    period_count: r[16] ? parseInt(r[16], 10) : undefined,
    period_end: r[17] ? parseInt(r[17], 10) : undefined,
    check_in_mode: (r[18] as Session["check_in_mode"]) || undefined,
    linked_session_id: r[19] || undefined,
    part_number: r[20] ? parseInt(r[20], 10) : undefined,
  };
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export async function getAttendanceForSession(
  accessToken: string,
  spreadsheetId: string,
  sessionId: string
): Promise<AttendanceRecord[]> {
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId, range: "attendance!A2:V",
  });
  return (res.data.values ?? [])
    .filter((r) => r[1] === sessionId)
    .map(rowToAttendance);
}

export async function getAttendanceForCourse(
  accessToken: string,
  spreadsheetId: string,
  courseId: string
): Promise<AttendanceRecord[]> {
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId, range: "attendance!A2:V",
  });
  return (res.data.values ?? [])
    .filter((r) => r[2] === courseId)
    .map(rowToAttendance);
}

export async function addAttendance(
  accessToken: string,
  spreadsheetId: string,
  record: AttendanceRecord
): Promise<void> {
  const sheets = getSheetsClient(accessToken);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "attendance!A:V",
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        record.attendance_id, record.session_id, record.course_id,
        record.student_id, record.firstname, record.lastname,
        record.status,
        record.gps_pass ? "TRUE" : "FALSE",
        record.distance_m, record.checked_at,
        record.overridden ? "TRUE" : "FALSE",
        record.overridden_at,
        record.device_fingerprint ?? "",
        record.edited_at ?? "",
        record.edited_from ?? "",
        record.edited_to ?? "",
        record.edit_note ?? "",
        record.is_manual_entry ? "TRUE" : "FALSE",
        record.flagged ? "TRUE" : "FALSE",
        record.flagged_at ?? "",
        record.action_taken ?? "",
        record.action_taken_at ?? "",
      ]],
    },
  });
}

export async function overrideAttendanceRecord(
  accessToken: string,
  spreadsheetId: string,
  attendanceId: string,
  overriddenAt: string
): Promise<void> {
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId, range: "attendance!A2:V",
  });
  const rows = res.data.values ?? [];
  const idx = rows.findIndex((r) => r[0] === attendanceId);
  if (idx === -1) throw new Error("Attendance record not found");

  const currentStatus = rows[idx][6] ?? "gps_fail";

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `attendance!G${idx + 2}`, values: [["present"]] },
        { range: `attendance!K${idx + 2}`, values: [["TRUE"]] },
        { range: `attendance!L${idx + 2}`, values: [[overriddenAt]] },
        { range: `attendance!N${idx + 2}`, values: [[overriddenAt]] },
        { range: `attendance!O${idx + 2}`, values: [[currentStatus]] },
        { range: `attendance!P${idx + 2}`, values: [["present"]] },
      ],
    },
  });
}

export async function editAttendanceRecord(
  accessToken: string,
  spreadsheetId: string,
  attendanceId: string,
  newStatus: AttendanceStatus,
  editNote: string
): Promise<{ editedFrom: string; editedAt: string } | null> {
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId, range: "attendance!A2:V",
  });
  const rows = res.data.values ?? [];
  const idx = rows.findIndex((r) => r[0] === attendanceId);
  if (idx === -1) return null;

  const oldStatus = rows[idx][6] ?? "absent";
  const editedAt = new Date().toISOString();

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `attendance!G${idx + 2}`, values: [[newStatus]] },
        { range: `attendance!K${idx + 2}`, values: [["FALSE"]] },
        { range: `attendance!N${idx + 2}`, values: [[editedAt]] },
        { range: `attendance!O${idx + 2}`, values: [[oldStatus]] },
        { range: `attendance!P${idx + 2}`, values: [[newStatus]] },
        { range: `attendance!Q${idx + 2}`, values: [[editNote]] },
      ],
    },
  });

  return { editedFrom: oldStatus, editedAt };
}

export async function markAbsentStudents(
  accessToken: string,
  spreadsheetId: string,
  sessionId: string,
  courseId: string,
  section: string,
  closedAt: string
): Promise<void> {
  const [students, existing] = await Promise.all([
    getStudents(accessToken, spreadsheetId, courseId, section),
    getAttendanceForSession(accessToken, spreadsheetId, sessionId),
  ]);
  const checkedIds = new Set(existing.map((a) => a.student_id));

  const absentStudents = students.filter((s) => !checkedIds.has(s.student_id));
  if (absentStudents.length === 0) return;

  const sheets = getSheetsClient(accessToken);
  // Batch all absent rows into a single append call
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "attendance!A:V",
    valueInputOption: "RAW",
    requestBody: {
      values: absentStudents.map((s) => [
        crypto.randomUUID(),
        sessionId,
        courseId,
        s.student_id,
        s.firstname,
        s.lastname,
        "absent",
        "FALSE",
        0,
        closedAt,
        "FALSE",
        "",
        "", // device_fingerprint
        "", // edited_at
        "", // edited_from
        "", // edited_to
        "", // edit_note
        "FALSE", // is_manual_entry
        "FALSE", // flagged
        "", // flagged_at
        "", // action_taken
        "", // action_taken_at
      ]),
    },
  });
}

function rowToAttendance(r: string[]): AttendanceRecord {
  return {
    attendance_id: r[0] ?? "",
    session_id: r[1] ?? "",
    course_id: r[2] ?? "",
    student_id: r[3] ?? "",
    firstname: r[4] ?? "",
    lastname: r[5] ?? "",
    status: (r[6] as AttendanceStatus) ?? "absent",
    gps_pass: r[7] === "TRUE",
    distance_m: parseFloat(r[8] ?? "0"),
    checked_at: r[9] ?? "",
    overridden: r[10] === "TRUE",
    overridden_at: r[11] ?? "",
    device_fingerprint: r[12] ?? "",
    edited_at: r[13] ?? "",
    edited_from: r[14] ?? "",
    edited_to: r[15] ?? "",
    edit_note: r[16] ?? "",
    is_manual_entry: r[17] === "TRUE",
    flagged: r[18] === "TRUE",
    flagged_at: r[19] || undefined,
    action_taken: (r[20] as AttendanceRecord["action_taken"]) || null,
    action_taken_at: r[21] || undefined,
  };
}

// ─── Unified attendance action ────────────────────────────────────────────────

export async function updateAttendanceFields(
  accessToken: string,
  spreadsheetId: string,
  attendanceId: string,
  fields: Partial<{
    status: string;
    overridden: boolean;
    overridden_at: string;
    flagged: boolean;
    flagged_at: string;
    action_taken: string;
    action_taken_at: string;
  }>
): Promise<{ found: boolean; previousStatus: string; previousOverridden: string }> {
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId, range: "attendance!A2:V",
  });
  const rows = (res.data.values ?? []) as string[][];
  const idx = rows.findIndex((r) => r[0] === attendanceId);
  if (idx === -1) return { found: false, previousStatus: "", previousOverridden: "" };

  const row = rows[idx];
  const rowNum = idx + 2;

  const updates: Array<{ range: string; values: string[][] }> = [];
  if (fields.status !== undefined)       updates.push({ range: `attendance!G${rowNum}`, values: [[fields.status]] });
  if (fields.overridden !== undefined)   updates.push({ range: `attendance!K${rowNum}`, values: [[fields.overridden ? "TRUE" : "FALSE"]] });
  if (fields.overridden_at !== undefined) updates.push({ range: `attendance!L${rowNum}`, values: [[fields.overridden_at]] });
  if (fields.flagged !== undefined)      updates.push({ range: `attendance!S${rowNum}`, values: [[fields.flagged ? "TRUE" : "FALSE"]] });
  if (fields.flagged_at !== undefined)   updates.push({ range: `attendance!T${rowNum}`, values: [[fields.flagged_at]] });
  if (fields.action_taken !== undefined) updates.push({ range: `attendance!U${rowNum}`, values: [[fields.action_taken]] });
  if (fields.action_taken_at !== undefined) updates.push({ range: `attendance!V${rowNum}`, values: [[fields.action_taken_at]] });

  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "RAW", data: updates },
    });
  }

  return {
    found: true,
    previousStatus: row[6] ?? "",
    previousOverridden: row[10] ?? "FALSE",
  };
}

// ─── Generic helpers ──────────────────────────────────────────────────────────

/** Fetch all rows for a range, filter, rewrite remaining rows. Returns deleted count. */
async function deleteMatchingRows(
  accessToken: string,
  spreadsheetId: string,
  sheetRange: string,   // e.g. "students!A2:F"
  predicate: (row: string[]) => boolean
): Promise<number> {
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: sheetRange });
  const rows = (res.data.values ?? []) as string[][];
  const kept = rows.filter((r) => !predicate(r));
  const deleted = rows.length - kept.length;
  if (deleted === 0) return 0;

  const sheetName = sheetRange.split("!")[0];
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: sheetRange });
  if (kept.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A2`,
      valueInputOption: "RAW",
      requestBody: { values: kept },
    });
  }
  return deleted;
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

import { AuditLog } from "@/types";

async function ensureAuditLogSheet(
  accessToken: string,
  spreadsheetId: string
): Promise<void> {
  const sheets = getSheetsClient(accessToken);
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });
  const exists = (meta.data.sheets ?? []).some(
    (s) => s.properties?.title === "audit_log"
  );
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: "audit_log" } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "audit_log!A1:I1",
      valueInputOption: "RAW",
      requestBody: {
        values: [["log_id", "timestamp", "action", "entity_type", "entity_id", "changed_from", "changed_to", "note", "actor"]],
      },
    });
  }
}

export async function appendAuditLog(
  accessToken: string,
  spreadsheetId: string,
  entry: Omit<AuditLog, "log_id" | "timestamp" | "changed_from" | "changed_to"> & {
    actor?: string;
    changed_from?: unknown;
    changed_to?: unknown;
  }
): Promise<void> {
  try {
    await ensureAuditLogSheet(accessToken, spreadsheetId);
    const sheets = getSheetsClient(accessToken);
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "audit_log!A:I",
      valueInputOption: "RAW",
      requestBody: {
        values: [[
          crypto.randomUUID(),
          new Date().toISOString(),
          entry.action,
          entry.entity_type,
          entry.entity_id,
          typeof entry.changed_from === "string" ? entry.changed_from : JSON.stringify(entry.changed_from ?? {}),
          typeof entry.changed_to === "string" ? entry.changed_to : JSON.stringify(entry.changed_to ?? {}),
          entry.note ?? "",
          entry.actor ?? "",
        ]],
      },
    });
  } catch {
    // Audit log failures should not break main operations
  }
}

export async function getAuditLog(
  accessToken: string,
  spreadsheetId: string,
  filters?: { entity_type?: string; action?: string; from?: string; to?: string }
): Promise<AuditLog[]> {
  await ensureAuditLogSheet(accessToken, spreadsheetId);
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "audit_log!A2:H",
  });
  let entries: AuditLog[] = (res.data.values ?? []).map((r) => ({
    log_id: r[0] ?? "",
    timestamp: r[1] ?? "",
    action: (r[2] as AuditLog["action"]) ?? "update",
    entity_type: (r[3] as AuditLog["entity_type"]) ?? "student",
    entity_id: r[4] ?? "",
    changed_from: r[5] ?? "",
    changed_to: r[6] ?? "",
    note: r[7] ?? "",
    actor: r[8] ?? "",
  }));

  if (filters?.entity_type) entries = entries.filter((e) => e.entity_type === filters.entity_type);
  if (filters?.action) entries = entries.filter((e) => e.action === filters.action);
  if (filters?.from) entries = entries.filter((e) => e.timestamp >= filters.from!);
  if (filters?.to) entries = entries.filter((e) => e.timestamp <= filters.to!);

  return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

// ─── Student CRUD ─────────────────────────────────────────────────────────────

export async function addStudent(
  accessToken: string,
  spreadsheetId: string,
  student: Student
): Promise<void> {
  const sheets = getSheetsClient(accessToken);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "students!A:F",
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        student.student_id, student.firstname, student.lastname,
        student.course_id, student.section, student.order_num,
      ]],
    },
  });
}

export async function updateStudentById(
  accessToken: string,
  spreadsheetId: string,
  courseId: string,
  section: string,
  oldStudentId: string,
  updates: Partial<Pick<Student, "student_id" | "firstname" | "lastname">>
): Promise<boolean> {
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: "students!A2:F" });
  const rows = (res.data.values ?? []) as string[][];
  const idx = rows.findIndex(
    (r) => r[0] === oldStudentId && r[3] === courseId && r[4] === section
  );
  if (idx === -1) return false;

  const row = [...rows[idx]];
  if (updates.student_id) row[0] = updates.student_id;
  if (updates.firstname !== undefined) row[1] = updates.firstname;
  if (updates.lastname !== undefined) row[2] = updates.lastname;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `students!A${idx + 2}:F${idx + 2}`,
    valueInputOption: "RAW",
    requestBody: { values: [row] },
  });
  return true;
}

export async function deleteStudentById(
  accessToken: string,
  spreadsheetId: string,
  courseId: string,
  section: string,
  studentId: string
): Promise<boolean> {
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: "students!A2:F" });
  const rows = (res.data.values ?? []) as string[][];
  const kept = rows.filter(
    (r) => !(r[0] === studentId && r[3] === courseId && r[4] === section)
  );
  if (kept.length === rows.length) return false;

  // Resequence order_num for this course+section
  let counter = 1;
  const resequenced = kept.map((r) => {
    if (r[3] === courseId && r[4] === section) {
      return [...r.slice(0, 5), String(counter++)];
    }
    return r;
  });

  await sheets.spreadsheets.values.clear({ spreadsheetId, range: "students!A2:F" });
  if (resequenced.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "students!A2",
      valueInputOption: "RAW",
      requestBody: { values: resequenced },
    });
  }
  return true;
}

export async function deleteAttendanceForStudent(
  accessToken: string,
  spreadsheetId: string,
  studentId: string,
  courseId: string
): Promise<number> {
  return deleteMatchingRows(
    accessToken, spreadsheetId, "attendance!A2:V",
    (r) => r[3] === studentId && r[2] === courseId
  );
}

export async function getMaxOrderNum(
  accessToken: string,
  spreadsheetId: string,
  courseId: string,
  section: string
): Promise<number> {
  const students = await getStudents(accessToken, spreadsheetId, courseId, section);
  return students.reduce((max, s) => Math.max(max, s.order_num), 0);
}

// ─── Course CRUD ──────────────────────────────────────────────────────────────

export async function updateCourseById(
  accessToken: string,
  spreadsheetId: string,
  courseId: string,
  section: string,
  updates: Partial<Pick<Course, "title" | "course_id" | "section" | "lecturer" | "semester" | "year">>
): Promise<boolean> {
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: "courses!A2:F" });
  const rows = (res.data.values ?? []) as string[][];
  const idx = rows.findIndex((r) => r[0] === courseId && r[2] === section);
  if (idx === -1) return false;

  const row = [...rows[idx]];
  if (updates.course_id !== undefined) row[0] = updates.course_id;
  if (updates.title !== undefined) row[1] = updates.title;
  if (updates.section !== undefined) row[2] = updates.section;
  if (updates.semester !== undefined) row[3] = updates.semester;
  if (updates.year !== undefined) row[4] = updates.year;
  if (updates.lecturer !== undefined) row[5] = updates.lecturer;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `courses!A${idx + 2}:F${idx + 2}`,
    valueInputOption: "RAW",
    requestBody: { values: [row] },
  });
  return true;
}

export async function deleteCourseById(
  accessToken: string,
  spreadsheetId: string,
  courseId: string,
  section: string
): Promise<void> {
  // Attendance must be deleted first (references sessions/students); the rest can run in parallel.
  await deleteMatchingRows(accessToken, spreadsheetId, "attendance!A2:V", (r) => r[2] === courseId);
  await Promise.all([
    deleteMatchingRows(accessToken, spreadsheetId, "sessions!A2:U", (r) => r[1] === courseId && r[2] === section),
    deleteMatchingRows(accessToken, spreadsheetId, "students!A2:F", (r) => r[3] === courseId && r[4] === section),
    deleteMatchingRows(accessToken, spreadsheetId, "courses!A2:F", (r) => r[0] === courseId && r[2] === section),
  ]);

  // Semester config
  try {
    const sheets = getSheetsClient(accessToken);
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: "semester_config!A2:K" });
    const rows = (res.data.values ?? []) as string[][];
    const kept = rows.filter((r) => !(r[0] === courseId && r[1] === section));
    if (kept.length < rows.length) {
      await sheets.spreadsheets.values.clear({ spreadsheetId, range: "semester_config!A2:K" });
      if (kept.length > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId, range: "semester_config!A2", valueInputOption: "RAW",
          requestBody: { values: kept },
        });
      }
    }
  } catch { /* ignore */ }
}

// ─── Session CRUD ─────────────────────────────────────────────────────────────

export async function updateSessionById(
  accessToken: string,
  spreadsheetId: string,
  sessionId: string,
  updates: Partial<Pick<Session,
    "week_label" | "date" | "period" | "closed_at" | "week_number" | "opened_at" |
    "period_count" | "period_end" | "check_in_mode" | "linked_session_id" | "part_number" |
    "otp" | "radius_m" | "late_after_min" | "otp_expire_min"
  >>
): Promise<boolean> {
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: "sessions!A2:U" });
  const rows = (res.data.values ?? []) as string[][];
  const idx = rows.findIndex((r) => r[0] === sessionId);
  if (idx === -1) return false;

  // Pad row to 21 columns so new fields always have indices
  const row = [...rows[idx]];
  while (row.length < 21) row.push("");

  if (updates.period !== undefined) row[3] = updates.period;
  if (updates.date !== undefined) row[4] = updates.date;
  if (updates.otp !== undefined) row[5] = updates.otp;
  if (updates.radius_m !== undefined) row[8] = String(updates.radius_m);
  if (updates.late_after_min !== undefined) row[9] = String(updates.late_after_min);
  if (updates.otp_expire_min !== undefined) row[10] = String(updates.otp_expire_min);
  if (updates.opened_at !== undefined) row[11] = updates.opened_at;
  if (updates.closed_at !== undefined) row[12] = updates.closed_at;
  if (updates.week_number !== undefined) row[13] = String(updates.week_number);
  if (updates.week_label !== undefined) row[14] = updates.week_label;
  if (updates.period_count !== undefined) row[16] = String(updates.period_count);
  if (updates.period_end !== undefined) row[17] = updates.period_end ? String(updates.period_end) : "";
  if (updates.check_in_mode !== undefined) row[18] = updates.check_in_mode ?? "";
  if (updates.linked_session_id !== undefined) row[19] = updates.linked_session_id ?? "";
  if (updates.part_number !== undefined) row[20] = updates.part_number ? String(updates.part_number) : "";

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `sessions!A${idx + 2}:U${idx + 2}`,
    valueInputOption: "RAW",
    requestBody: { values: [row] },
  });
  return true;
}

export async function deleteSessionById(
  accessToken: string,
  spreadsheetId: string,
  sessionId: string
): Promise<void> {
  await deleteMatchingRows(accessToken, spreadsheetId, "attendance!A2:V", (r) => r[1] === sessionId);
  await deleteMatchingRows(accessToken, spreadsheetId, "sessions!A2:U", (r) => r[0] === sessionId);
}

export async function reopenSession(
  accessToken: string,
  spreadsheetId: string,
  sessionId: string,
  overrides?: { radius_m?: number; late_after_min?: number; otp_expire_min?: number }
): Promise<{ otp: string; opened_at: string } | null> {
  const otp = generateOTP();
  const opened_at = new Date().toISOString();
  const ok = await updateSessionById(accessToken, spreadsheetId, sessionId, {
    closed_at: "", opened_at, otp, ...overrides,
  });
  return ok ? { otp, opened_at } : null;
}

// ─── Attendance CRUD ──────────────────────────────────────────────────────────

export async function deleteAttendanceById(
  accessToken: string,
  spreadsheetId: string,
  attendanceId: string
): Promise<boolean> {
  const deleted = await deleteMatchingRows(
    accessToken, spreadsheetId, "attendance!A2:V",
    (r) => r[0] === attendanceId
  );
  return deleted > 0;
}

// ─── Course stats ─────────────────────────────────────────────────────────────

export interface CourseStats {
  student_count: number;
  session_count: number;
  last_session_date: string;
  avg_attendance_pct: number;
  open_session_id?: string;
}

export async function getCourseStats(
  accessToken: string,
  spreadsheetId: string
): Promise<Record<string, CourseStats>> {
  const sheets = getSheetsClient(accessToken);
  const [stuRes, sessRes, attRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId, range: "students!A2:F" }),
    sheets.spreadsheets.values.get({ spreadsheetId, range: "sessions!A2:U" }),
    sheets.spreadsheets.values.get({ spreadsheetId, range: "attendance!A2:V" }),
  ]);

  const stats: Record<string, CourseStats> = {};

  const key = (courseId: string, section: string) => `${courseId}__${section}`;

  for (const r of stuRes.data.values ?? []) {
    const k = key(r[3] ?? "", r[4] ?? "");
    if (!stats[k]) stats[k] = { student_count: 0, session_count: 0, last_session_date: "", avg_attendance_pct: 0 };
    stats[k].student_count++;
  }

  for (const r of sessRes.data.values ?? []) {
    const k = key(r[1] ?? "", r[2] ?? "");
    if (!stats[k]) stats[k] = { student_count: 0, session_count: 0, last_session_date: "", avg_attendance_pct: 0 };
    if (r[12]) { // closed_at — session is closed
      stats[k].session_count++;
      if (!stats[k].last_session_date || r[4] > stats[k].last_session_date) {
        stats[k].last_session_date = r[4];
      }
    } else if (r[11] && r[15] !== "true") { // opened_at set, closed_at empty, not past session
      stats[k].open_session_id = r[0]; // session_id
    }
  }

  // Map sessionId → courseKey (course_id + section) for accurate per-section aggregation
  const sessionKeyMap = new Map<string, string>();
  for (const r of sessRes.data.values ?? []) {
    if (r[12]) sessionKeyMap.set(r[0], key(r[1] ?? "", r[2] ?? ""));
  }

  // Per-section attendance % aggregation
  const attCounts: Record<string, { attended: number; total: number }> = {};
  for (const r of attRes.data.values ?? []) {
    const sessionKey = sessionKeyMap.get(r[1]);
    if (!sessionKey) continue; // session not closed or not found
    if (!attCounts[sessionKey]) attCounts[sessionKey] = { attended: 0, total: 0 };
    attCounts[sessionKey].total++;
    if (r[6] === "present" || r[6] === "late") attCounts[sessionKey].attended++;
  }

  // Attach avg % to stats (course+section level)
  for (const k of Object.keys(stats)) {
    const ac = attCounts[k];
    if (ac && ac.total > 0) {
      stats[k].avg_attendance_pct = Math.round((ac.attended / ac.total) * 100);
    }
  }

  return stats;
}
