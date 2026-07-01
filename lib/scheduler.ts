// Background scheduler: auto-opens sessions at each course's scheduled class time and
// auto-closes them at OTP expiry, for courses with SemesterConfig.auto_open_enabled.
//
// Because Google Sheets is only reachable via each admin's own OAuth token, this cannot
// discover courses globally — it iterates admins known to lib/token-registry.ts (whoever
// has ever logged in), refreshes each one's access token from their stored refresh_token,
// then reads their spreadsheet exactly like any other request-scoped route would.

import {
  initializeSpreadsheet,
  getCourses,
  getAllSessions,
  getSemesterConfig,
  closeSessionInSheet,
  markAbsentStudents,
} from "@/lib/sheets";
import { openSessionForCourse } from "@/lib/session-open";
import { refreshGoogleAccessToken } from "@/lib/google-token";
import {
  listKnownAdminEmails,
  getAdminTokenStatus,
  getAdminRefreshToken,
  saveAdminRefreshToken,
  markAdminTokenInvalid,
  markAdminTokenOk,
} from "@/lib/token-registry";
import { getBangkokNow, isWithinOpenWindow } from "@/lib/schedule-time";
import { getWeekLabel } from "@/lib/week-utils";
import { getPeriodLabel } from "@/lib/period-utils";
import { notifyAdminOnOpen } from "@/lib/notify";
import { Course, Session, SemesterConfig } from "@/types";

const TICK_INTERVAL_MS = 60_000;
const OPEN_WINDOW_TOLERANCE_MIN = 2; // a tick can be up to 2 min "late" and still catch the open

declare global {
  var __attendanceSchedulerStarted: boolean | undefined;
}

export function startScheduler(): void {
  // globalThis (not a module-local var) survives Next.js dev-mode module reloads,
  // so a hot-reload can't register a second overlapping interval.
  if (globalThis.__attendanceSchedulerStarted) return;
  globalThis.__attendanceSchedulerStarted = true;

  let ticking = false;
  setInterval(() => {
    if (ticking) {
      console.warn("[scheduler] previous tick still running, skipping this tick");
      return;
    }
    ticking = true;
    runTick()
      .catch((e) => console.error("[scheduler] tick failed", e))
      .finally(() => { ticking = false; });
  }, TICK_INTERVAL_MS);

  console.log("[scheduler] started, interval =", TICK_INTERVAL_MS, "ms");
}

async function runTick(): Promise<void> {
  const emails = await listKnownAdminEmails();
  for (const email of emails) {
    try {
      await processAdmin(email);
    } catch (e) {
      console.error(`[scheduler] admin ${email} failed`, e);
      // one admin's failure must not block the rest
    }
  }
}

async function processAdmin(email: string): Promise<void> {
  const status = await getAdminTokenStatus(email);
  if (status === "invalid") return; // already flagged; don't hammer a known-dead token

  const storedRefreshToken = await getAdminRefreshToken(email);
  if (!storedRefreshToken) return;

  let accessToken: string;
  try {
    const refreshed = await refreshGoogleAccessToken(storedRefreshToken);
    accessToken = refreshed.access_token;
    if (refreshed.refresh_token !== storedRefreshToken) {
      await saveAdminRefreshToken(email, refreshed.refresh_token);
    } else {
      await markAdminTokenOk(email);
    }
  } catch (e) {
    await markAdminTokenInvalid(email, e instanceof Error ? e.message : String(e));
    return; // this admin's courses are skipped this tick; banner covers the UX
  }

  const spreadsheetId = await initializeSpreadsheet(accessToken);
  const [courses, allSessions] = await Promise.all([
    getCourses(accessToken, spreadsheetId),
    getAllSessions(accessToken, spreadsheetId),
  ]);

  // One SemesterConfig lookup per course per tick (shared between the open-check and
  // close-check passes below), not one per pass.
  const configCache = new Map<string, SemesterConfig | null>();
  const loadConfig = async (course: Course): Promise<SemesterConfig | null> => {
    const key = `${course.course_id}__${course.section}`;
    if (!configCache.has(key)) {
      configCache.set(
        key,
        await getSemesterConfig(accessToken, spreadsheetId, course.course_id, course.section)
      );
    }
    return configCache.get(key) ?? null;
  };

  const { dayOfWeek, hhmm, dateStr } = getBangkokNow();

  for (const course of courses) {
    try {
      const config = await loadConfig(course);
      if (!config?.auto_open_enabled) continue;
      await processCourseOpen(accessToken, spreadsheetId, email, course, config, allSessions, dayOfWeek, hhmm, dateStr);
    } catch (e) {
      console.error(`[scheduler] course ${course.course_id}/${course.section} open-check failed`, e);
    }
  }

  for (const course of courses) {
    try {
      const config = await loadConfig(course);
      if (!config?.auto_open_enabled) continue;
      await processCourseAutoClose(accessToken, spreadsheetId, course, allSessions);
    } catch (e) {
      console.error(`[scheduler] course ${course.course_id}/${course.section} close-check failed`, e);
    }
  }
}

async function processCourseOpen(
  accessToken: string,
  spreadsheetId: string,
  email: string,
  course: Course,
  config: SemesterConfig,
  allSessions: Session[],
  dayOfWeek: number,
  hhmm: string,
  dateStr: string
): Promise<void> {
  const todaysSchedule = config.teaching_schedule.filter((td) => td.day === dayOfWeek);

  for (const td of todaysSchedule) {
    if (!td.start_time) continue; // can't schedule without a start time
    if (!isWithinOpenWindow(hhmm, td.start_time, OPEN_WINDOW_TOLERANCE_MIN)) continue;

    // Idempotency: never create a second row for the same course+section+date+period,
    // no matter how many ticks land inside the open window.
    const alreadyExists = allSessions.some((s) =>
      s.course_id === course.course_id &&
      s.section === course.section &&
      s.date === dateStr &&
      s.period === td.period
    );
    if (alreadyExists) continue;

    if (config.default_lat == null || config.default_lng == null) {
      console.warn(
        `[scheduler] ${course.course_id}/${course.section} has auto_open_enabled but no default_lat/lng — skipping`
      );
      continue;
    }

    const weekInfo = getWeekLabel(
      new Date(dateStr),
      new Date(config.semester_start),
      config.teaching_schedule.map((d) => d.day)
    );

    const result = await openSessionForCourse(accessToken, spreadsheetId, {
      course_id: course.course_id,
      section: course.section,
      period: td.period,
      lat: config.default_lat,
      lng: config.default_lng,
      radius_m: config.default_gps_radius,
      late_after_min: config.default_late_min,
      otp_expire_min: config.default_otp_min,
      week_number: weekInfo.weekNumber,
      week_label: weekInfo.label,
      date: dateStr,
      period_count: td.period_count ?? 1,
      check_in_mode: td.check_in_mode,
    });

    console.log(`[scheduler] auto-opened ${course.course_id}/${course.section} period ${td.period} on ${dateStr}`);

    try {
      const periodNum = parseInt(td.period, 10);
      const periodLabel = getPeriodLabel(periodNum, td.period_end, td.start_time, td.end_time);
      const checkUrl = process.env.NEXTAUTH_URL
        ? `${process.env.NEXTAUTH_URL}/check?session_id=${result.session.session_id}`
        : undefined;
      const message = [
        `เปิดคาบเรียนอัตโนมัติแล้ว: ${course.title} (${course.course_id}) Sec.${course.section}`,
        `${periodLabel} · ${dateStr}`,
        `OTP: ${result.session.otp} (หมดอายุใน ${config.default_otp_min} นาที)`,
        checkUrl ? `ลิงก์เช็คชื่อ: ${checkUrl}` : undefined,
      ].filter(Boolean).join("\n");

      await notifyAdminOnOpen(email, `เปิดคาบ ${course.title} อัตโนมัติแล้ว`, message);
    } catch (e) {
      console.error(`[scheduler] failed to notify admin for session ${result.session.session_id}`, e);
    }
  }
}

// Scoped to auto-open-enabled courses only: the existing client-side auto-close
// (app/admin/session/[sessionId]/SessionClient.tsx polling) only runs while a browser
// tab is open, which auto-opened sessions can't rely on.
async function processCourseAutoClose(
  accessToken: string,
  spreadsheetId: string,
  course: Course,
  allSessions: Session[]
): Promise<void> {
  const now = Date.now();
  const sessionsForCourse = allSessions.filter(
    (s) => s.course_id === course.course_id && s.section === course.section
  );

  for (const s of sessionsForCourse) {
    if (!s.opened_at || s.closed_at) continue; // not open, or already closed

    const openedAtMs = new Date(s.opened_at).getTime();
    const expiresAtMs = openedAtMs + s.otp_expire_min * 60_000;
    if (now < expiresAtMs) continue; // not yet expired

    const closedAt = new Date().toISOString();
    try {
      await closeSessionInSheet(accessToken, spreadsheetId, s.session_id, closedAt);
      await markAbsentStudents(accessToken, spreadsheetId, s.session_id, s.course_id, s.section, closedAt);
      console.log(`[scheduler] auto-closed session ${s.session_id} (${s.course_id}/${s.section})`);
    } catch (e) {
      console.error(`[scheduler] failed to auto-close session ${s.session_id}`, e);
    }
  }
}
