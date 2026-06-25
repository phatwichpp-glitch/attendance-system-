import { google } from "googleapis";
import { Course, Student, Session, AttendanceRecord } from "./types";

function getSheetsClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.sheets({ version: "v4", auth });
}

function getDriveClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth });
}

export async function findOrCreateSpreadsheet(accessToken: string): Promise<string> {
  const drive = getDriveClient(accessToken);
  const res = await drive.files.list({
    q: "name='AttendanceDB' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    fields: "files(id, name)",
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
      ],
    },
  });

  const spreadsheetId = created.data.spreadsheetId!;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
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
          range: "sessions!A1:M1",
          values: [["session_id", "course_id", "section", "period", "date", "otp", "lat", "lng", "radius_m", "late_after_min", "otp_expire_min", "opened_at", "closed_at"]],
        },
        {
          range: "attendance!A1:N1",
          values: [["attendance_id", "session_id", "course_id", "student_id", "firstname", "lastname", "status", "gps_pass", "distance_m", "checked_at", "overridden", "overridden_at"]],
        },
      ],
    },
  });

  return spreadsheetId;
}

export async function getSpreadsheetId(accessToken: string): Promise<string> {
  return findOrCreateSpreadsheet(accessToken);
}

// ── Courses ──────────────────────────────────────────────────────────────────

export async function getCourses(accessToken: string, spreadsheetId: string): Promise<Course[]> {
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "courses!A2:F",
  });
  const rows = res.data.values ?? [];
  return rows.map((r) => ({
    course_id: r[0] ?? "",
    title: r[1] ?? "",
    section: r[2] ?? "",
    semester: r[3] ?? "",
    year: r[4] ?? "",
    lecturer: r[5] ?? "",
  }));
}

export async function upsertCourse(accessToken: string, spreadsheetId: string, course: Course) {
  const sheets = getSheetsClient(accessToken);
  const existing = await getCourses(accessToken, spreadsheetId);
  const idx = existing.findIndex((c) => c.course_id === course.course_id && c.section === course.section);

  if (idx === -1) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "courses!A:F",
      valueInputOption: "RAW",
      requestBody: {
        values: [[course.course_id, course.title, course.section, course.semester, course.year, course.lecturer]],
      },
    });
  } else {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `courses!A${idx + 2}:F${idx + 2}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [[course.course_id, course.title, course.section, course.semester, course.year, course.lecturer]],
      },
    });
  }
}

// ── Students ─────────────────────────────────────────────────────────────────

export async function getStudents(accessToken: string, spreadsheetId: string, courseId: string, section?: string): Promise<Student[]> {
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "students!A2:F",
  });
  const rows = res.data.values ?? [];
  return rows
    .map((r) => ({
      student_id: r[0] ?? "",
      firstname: r[1] ?? "",
      lastname: r[2] ?? "",
      course_id: r[3] ?? "",
      section: r[4] ?? "",
      order_num: parseInt(r[5] ?? "0", 10),
    }))
    .filter((s) => s.course_id === courseId && (!section || s.section === section));
}

export async function upsertStudents(
  accessToken: string,
  spreadsheetId: string,
  students: Student[]
) {
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "students!A2:F",
  });
  const existingRows = res.data.values ?? [];

  const courseId = students[0]?.course_id;
  const section = students[0]?.section;

  const keptRows = existingRows.filter(
    (r) => !(r[3] === courseId && r[4] === section)
  );

  const newRows = students.map((s) => [
    s.student_id, s.firstname, s.lastname, s.course_id, s.section, s.order_num,
  ]);

  const allRows = [...keptRows, ...newRows];

  await sheets.spreadsheets.values.clear({ spreadsheetId, range: "students!A2:F" });

  if (allRows.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "students!A2:F",
      valueInputOption: "RAW",
      requestBody: { values: allRows },
    });
  }
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export async function createSession(accessToken: string, spreadsheetId: string, session: Session) {
  const sheets = getSheetsClient(accessToken);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "sessions!A:M",
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        session.session_id, session.course_id, session.section, session.period,
        session.date, session.otp, session.lat, session.lng, session.radius_m,
        session.late_after_min, session.otp_expire_min, session.opened_at, session.closed_at,
      ]],
    },
  });
}

export async function getSessions(accessToken: string, spreadsheetId: string): Promise<Session[]> {
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "sessions!A2:M",
  });
  const rows = res.data.values ?? [];
  return rows.map(rowToSession);
}

export async function getSession(accessToken: string, spreadsheetId: string, sessionId: string): Promise<Session | null> {
  const all = await getSessions(accessToken, spreadsheetId);
  return all.find((s) => s.session_id === sessionId) ?? null;
}

export async function closeSession(accessToken: string, spreadsheetId: string, sessionId: string, closedAt: string) {
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "sessions!A2:M",
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
  };
}

// ── Attendance ────────────────────────────────────────────────────────────────

export async function getAttendanceForSession(
  accessToken: string,
  spreadsheetId: string,
  sessionId: string
): Promise<AttendanceRecord[]> {
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "attendance!A2:L",
  });
  const rows = res.data.values ?? [];
  return rows
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
    spreadsheetId,
    range: "attendance!A2:L",
  });
  const rows = res.data.values ?? [];
  return rows
    .filter((r) => r[2] === courseId)
    .map(rowToAttendance);
}

export async function createAttendance(accessToken: string, spreadsheetId: string, record: AttendanceRecord) {
  const sheets = getSheetsClient(accessToken);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "attendance!A:L",
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        record.attendance_id, record.session_id, record.course_id, record.student_id,
        record.firstname, record.lastname, record.status, record.gps_pass ? "TRUE" : "FALSE",
        record.distance_m, record.checked_at, record.overridden ? "TRUE" : "FALSE", record.overridden_at,
      ]],
    },
  });
}

export async function overrideAttendance(
  accessToken: string,
  spreadsheetId: string,
  attendanceId: string,
  overriddenAt: string
) {
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "attendance!A2:L",
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
      ],
    },
  });
}

export async function markAbsentees(
  accessToken: string,
  spreadsheetId: string,
  sessionId: string,
  courseId: string,
  section: string,
  closedAt: string
) {
  const students = await getStudents(accessToken, spreadsheetId, courseId, section);
  const existing = await getAttendanceForSession(accessToken, spreadsheetId, sessionId);
  const checkedIds = new Set(existing.map((a) => a.student_id));

  for (const student of students) {
    if (!checkedIds.has(student.student_id)) {
      const record: AttendanceRecord = {
        attendance_id: `${sessionId}_${student.student_id}`,
        session_id: sessionId,
        course_id: courseId,
        student_id: student.student_id,
        firstname: student.firstname,
        lastname: student.lastname,
        status: "absent",
        gps_pass: false,
        distance_m: 0,
        checked_at: closedAt,
        overridden: false,
        overridden_at: "",
      };
      await createAttendance(accessToken, spreadsheetId, record);
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
    status: (r[6] as AttendanceRecord["status"]) ?? "absent",
    gps_pass: r[7] === "TRUE",
    distance_m: parseFloat(r[8] ?? "0"),
    checked_at: r[9] ?? "",
    overridden: r[10] === "TRUE",
    overridden_at: r[11] ?? "",
  };
}

// ── Haversine ─────────────────────────────────────────────────────────────────

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
