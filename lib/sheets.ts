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
          range: "sessions!A1:P1",
          values: [[
            "session_id", "course_id", "section", "period", "date", "otp",
            "lat", "lng", "radius_m", "late_after_min", "otp_expire_min",
            "opened_at", "closed_at", "week_number", "week_label", "is_past_session",
          ]],
        },
        {
          range: "attendance!A1:R1",
          values: [[
            "attendance_id", "session_id", "course_id", "student_id", "firstname", "lastname",
            "status", "gps_pass", "distance_m", "checked_at", "overridden", "overridden_at",
            "device_fingerprint", "edited_at", "edited_from", "edited_to", "edit_note", "is_manual_entry",
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
    range: "sessions!A:P",
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
    spreadsheetId, range: "sessions!A2:P",
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
    spreadsheetId, range: "sessions!A2:P",
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
    spreadsheetId, range: "attendance!A2:R",
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
    spreadsheetId, range: "attendance!A2:R",
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
    range: "attendance!A:R",
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
    spreadsheetId, range: "attendance!A2:R",
  });
  const rows = res.data.values ?? [];
  const idx = rows.findIndex((r) => r[0] === attendanceId);
  if (idx === -1) throw new Error("Attendance record not found");

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `attendance!G${idx + 2}`, values: [["present"]] },
        { range: `attendance!K${idx + 2}`, values: [["TRUE"]] },
        { range: `attendance!L${idx + 2}`, values: [[overriddenAt]] },
        { range: `attendance!N${idx + 2}`, values: [[overriddenAt]] },
        { range: `attendance!O${idx + 2}`, values: [["gps_fail"]] },
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
    spreadsheetId, range: "attendance!A2:R",
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
  const students = await getStudents(accessToken, spreadsheetId, courseId, section);
  const existing = await getAttendanceForSession(accessToken, spreadsheetId, sessionId);
  const checkedIds = new Set(existing.map((a) => a.student_id));

  for (const s of students) {
    if (!checkedIds.has(s.student_id)) {
      await addAttendance(accessToken, spreadsheetId, {
        attendance_id: `${sessionId}_${s.student_id}`,
        session_id: sessionId,
        course_id: courseId,
        student_id: s.student_id,
        firstname: s.firstname,
        lastname: s.lastname,
        status: "absent",
        gps_pass: false,
        distance_m: 0,
        checked_at: closedAt,
        overridden: false,
        overridden_at: "",
      });
    }
  }
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
  };
}
