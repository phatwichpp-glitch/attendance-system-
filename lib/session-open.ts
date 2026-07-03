// Shared "open a session" logic — extracted from the manual POST /api/sheets/sessions
// route so the auto-open scheduler (lib/scheduler.ts) can create sessions identically
// (including double-period handling) without a browser request in flight.

import { createSession, deleteSessionById } from "@/lib/sheets";
import { registerSession } from "@/lib/session-store";
import { generateOTP } from "@/lib/otp";
import { Session } from "@/types";
import { getWeekLabel } from "@/lib/week-utils";
import { calcPeriodEnd } from "@/lib/period-utils";

export interface OpenSessionInput {
  course_id: string;
  section: string;
  period: number | string;
  lat: number | string;
  lng: number | string;
  radius_m: number | string;
  late_after_min: number | string;
  late_enabled?: boolean;
  otp_expire_min: number | string;
  week_number?: number;
  week_label?: string;
  date?: string;
  is_past_session?: boolean;
  semester_start?: string;
  teaching_days?: number[];
  period_count?: number | string;
  check_in_mode?: "single" | "double";
}

export type OpenSessionResult =
  | { mode: "single"; session: Session; spreadsheetId: string }
  | { mode: "double"; session: Session; linked_session: Session; spreadsheetId: string };

export async function openSessionForCourse(
  accessToken: string,
  spreadsheetId: string,
  input: OpenSessionInput
): Promise<OpenSessionResult> {
  const {
    course_id,
    section,
    period,
    lat,
    lng,
    radius_m,
    late_after_min,
    late_enabled = true,
    otp_expire_min,
    week_number,
    week_label,
    date: bodyDate,
    is_past_session = false,
    semester_start,
    teaching_days,
    period_count = 1,
    check_in_mode,
  } = input;

  const today = bodyDate ?? new Date().toISOString().split("T")[0];

  let resolvedWeekNumber: number | undefined = week_number;
  let resolvedWeekLabel: string | undefined = week_label;

  if (semester_start && !week_label) {
    const days: number[] = Array.isArray(teaching_days) ? teaching_days : [];
    const computed = getWeekLabel(new Date(today), new Date(semester_start), days);
    resolvedWeekNumber = computed.weekNumber;
    resolvedWeekLabel = computed.label;
  }

  const periodNum = parseInt(String(period), 10);
  const periodCount = parseInt(String(period_count), 10) || 1;
  const periodEnd = periodCount >= 2 ? calcPeriodEnd(periodNum, periodCount) : undefined;
  const parsedLat = parseFloat(String(lat));
  const parsedLng = parseFloat(String(lng));
  const parsedRadius = parseInt(String(radius_m), 10);
  const parsedLateAfter = parseInt(String(late_after_min), 10);
  const parsedOtpExpire = parseInt(String(otp_expire_min), 10);

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
      lat: is_past_session ? 0 : parsedLat,
      lng: is_past_session ? 0 : parsedLng,
      radius_m: parsedRadius,
      late_after_min: parsedLateAfter,
      late_enabled: !!late_enabled,
      otp_expire_min: parsedOtpExpire,
      opened_at: "", // inactive until teacher opens it
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
      lat: is_past_session ? 0 : parsedLat,
      lng: is_past_session ? 0 : parsedLng,
      radius_m: parsedRadius,
      late_after_min: parsedLateAfter,
      late_enabled: !!late_enabled,
      otp_expire_min: parsedOtpExpire,
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
      await createSession(accessToken, spreadsheetId, part2Data);
      await createSession(accessToken, spreadsheetId, part1Data);
    } catch (err) {
      // Attempt cleanup of Part 2 orphan
      try {
        await deleteSessionById(accessToken, spreadsheetId, part2Id);
      } catch {
        /* ignore */
      }
      throw err;
    }

    // Only register Part 1 in session-store (Part 2 opens later)
    await registerSession(part1Data.session_id, spreadsheetId, accessToken, part1Data.otp);

    return { mode: "double", session: part1Data, linked_session: part2Data, spreadsheetId };
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
    lat: is_past_session ? 0 : parsedLat,
    lng: is_past_session ? 0 : parsedLng,
    radius_m: parsedRadius,
    late_after_min: parsedLateAfter,
    late_enabled: !!late_enabled,
    otp_expire_min: parsedOtpExpire,
    opened_at: new Date().toISOString(),
    closed_at: is_past_session ? new Date().toISOString() : "",
    week_number: resolvedWeekNumber,
    week_label: finalWeekLabel,
    is_past_session: !!is_past_session,
    period_count: periodCount,
    period_end: periodEnd,
  };

  await createSession(accessToken, spreadsheetId, sessionData);

  // Register in session-store
  await registerSession(sessionData.session_id, spreadsheetId, accessToken, sessionData.otp);

  return { mode: "single", session: sessionData, spreadsheetId };
}
