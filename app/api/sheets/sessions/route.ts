import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  initializeSpreadsheet,
  getSessionById,
  createSession,
  closeSessionInSheet,
  markAbsentStudents,
  getAllSessions,
  deleteSessionById,
  updateSessionById,
} from "@/lib/sheets";
import { registerSession } from "@/lib/session-store";
import { generateOTP } from "@/lib/otp";
import { Session } from "@/types";
import { getWeekLabel } from "@/lib/week-utils";
import { calcPeriodEnd } from "@/lib/period-utils";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const {
      course_id,
      section,
      period,
      lat,
      lng,
      radius_m,
      late_after_min,
      otp_expire_min,
      week_number,
      week_label,
      date: bodyDate,
      is_past_session = false,
      semester_start,
      teaching_days,
      period_count = 1,
      check_in_mode,
    } = body;

    const today = bodyDate ?? new Date().toISOString().split("T")[0];

    // Auto-calculate week label if not supplied but semester_start given
    let resolvedWeekNumber: number | undefined = week_number;
    let resolvedWeekLabel: string | undefined = week_label;

    const spreadsheetId = await initializeSpreadsheet(session.access_token);

    if (semester_start && !week_label) {
      const allSessions = await getAllSessions(session.access_token, spreadsheetId);
      const sessionDate = new Date(today);
      const semStart = new Date(semester_start);
      const weekNum = Math.max(1, Math.ceil(
        (sessionDate.getTime() - semStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
      ));
      const sessionsThisWeek = allSessions.filter((s) => {
        if (s.course_id !== course_id || s.section !== section) return false;
        if (!s.week_number) return false;
        return s.week_number === weekNum;
      }).length;
      const days: number[] = Array.isArray(teaching_days) ? teaching_days : [];
      const computed = getWeekLabel(sessionDate, semStart, days, sessionsThisWeek);
      resolvedWeekNumber = computed.weekNumber;
      resolvedWeekLabel = computed.label;
    }

    const periodNum = parseInt(String(period), 10);
    const periodCount = parseInt(String(period_count), 10) || 1;
    const periodEnd = periodCount >= 2 ? calcPeriodEnd(periodNum, periodCount) : undefined;

    // ── Two check-ins (double period, separate check-ins) ──────────────────────
    if (periodCount >= 2 && check_in_mode === "double") {
      // Week labels: Part 1 = "W3①", Part 2 = "W3②"
      const baseLabel = resolvedWeekLabel ?? `W${resolvedWeekNumber ?? 1}`;
      const label1 = `${baseLabel}①`;
      const label2 = `${baseLabel}②`;
      const part2Period = periodEnd ? String(periodEnd) : String(periodNum + 1);

      // Create Part 2 first (inactive — no opened_at)
      const part2Id = crypto.randomUUID();
      const part1Id = crypto.randomUUID();

      const part2Data: Session = {
        session_id: part2Id,
        course_id,
        section,
        period: part2Period,
        date: today,
        otp: generateOTP(),
        lat: is_past_session ? 0 : parseFloat(lat),
        lng: is_past_session ? 0 : parseFloat(lng),
        radius_m: parseInt(radius_m, 10),
        late_after_min: parseInt(late_after_min, 10),
        otp_expire_min: parseInt(otp_expire_min, 10),
        opened_at: "",           // inactive until teacher opens it
        closed_at: is_past_session ? new Date().toISOString() : "",
        week_number: resolvedWeekNumber,
        week_label: label2,
        is_past_session: !!is_past_session,
        period_count: 1,
        check_in_mode: "double",
        linked_session_id: part1Id,
        part_number: 2,
      };

      const part1Data: Session = {
        session_id: part1Id,
        course_id,
        section,
        period: String(periodNum),
        date: today,
        otp: generateOTP(),
        lat: is_past_session ? 0 : parseFloat(lat),
        lng: is_past_session ? 0 : parseFloat(lng),
        radius_m: parseInt(radius_m, 10),
        late_after_min: parseInt(late_after_min, 10),
        otp_expire_min: parseInt(otp_expire_min, 10),
        opened_at: new Date().toISOString(),
        closed_at: is_past_session ? new Date().toISOString() : "",
        week_number: resolvedWeekNumber,
        week_label: label1,
        is_past_session: !!is_past_session,
        period_count: 1,
        check_in_mode: "double",
        linked_session_id: part2Id,
        part_number: 1,
      };

      try {
        await createSession(session.access_token, spreadsheetId, part2Data);
        await createSession(session.access_token, spreadsheetId, part1Data);
      } catch (err) {
        // Attempt cleanup of Part 2 orphan
        try { await deleteSessionById(session.access_token, spreadsheetId, part2Id); } catch { /* ignore */ }
        throw err;
      }

      // Only register Part 1 in session-store (Part 2 opens later)
      registerSession(part1Data.session_id, spreadsheetId, session.access_token, part1Data.otp);

      return NextResponse.json({
        session: part1Data,
        linked_session: part2Data,
        spreadsheetId,
        mode: "double",
      });
    }

    // ── Single check-in (single or double period) ───────────────────────────────
    let finalWeekLabel = resolvedWeekLabel;
    if (periodCount >= 2) {
      finalWeekLabel = finalWeekLabel ? `${finalWeekLabel} (×2)` : undefined;
    }

    const sessionData: Session = {
      session_id: crypto.randomUUID(),
      course_id,
      section,
      period: String(periodNum),
      date: today,
      otp: generateOTP(),
      lat: is_past_session ? 0 : parseFloat(lat),
      lng: is_past_session ? 0 : parseFloat(lng),
      radius_m: parseInt(radius_m, 10),
      late_after_min: parseInt(late_after_min, 10),
      otp_expire_min: parseInt(otp_expire_min, 10),
      opened_at: new Date().toISOString(),
      closed_at: is_past_session ? new Date().toISOString() : "",
      week_number: resolvedWeekNumber,
      week_label: finalWeekLabel,
      is_past_session: !!is_past_session,
      period_count: periodCount,
      period_end: periodEnd,
    };

    await createSession(session.access_token, spreadsheetId, sessionData);

    // Register in session-store
    registerSession(sessionData.session_id, spreadsheetId, session.access_token, sessionData.otp);

    return NextResponse.json({ session: sessionData, spreadsheetId });
  } catch (err) {
    console.error("[sessions POST]", err);
    return NextResponse.json({ error: "Failed to open session" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { session_id, course_id, section } = await req.json();
    const closedAt = new Date().toISOString();
    const spreadsheetId = await initializeSpreadsheet(session.access_token);

    const sessionData = await getSessionById(session.access_token, spreadsheetId, session_id);

    await closeSessionInSheet(session.access_token, spreadsheetId, session_id, closedAt);
    await markAbsentStudents(
      session.access_token, spreadsheetId, session_id,
      course_id ?? sessionData?.course_id, section ?? sessionData?.section, closedAt
    );

    return NextResponse.json({ success: true, closed_at: closedAt });
  } catch (err) {
    console.error("[sessions PATCH]", err);
    return NextResponse.json({ error: "Failed to close session" }, { status: 500 });
  }
}
