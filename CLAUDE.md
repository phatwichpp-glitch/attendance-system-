# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

- `npm run dev` — start dev server (Turbopack)
- `npm run build` — production build
- `npm run start` — run production build
- `npm run lint` — ESLint (flat config, `eslint-config-next` core-web-vitals + typescript)

There is no test suite/framework configured in this repo (no jest/vitest/playwright).

## Architecture

**This app has no traditional database.** Google Sheets is the persistence layer. Each admin's Google account gets its own spreadsheet (named `AttendanceDB`, auto-created by `initializeSpreadsheet` in [lib/sheets.ts](lib/sheets.ts)) with sheets/tabs: `courses`, `students`, `sessions`, `attendance`, `semester_config`. All reads/writes go through the Google Sheets API using the signed-in user's own OAuth token — there is no service account. `lib/sheets.ts` (~1200 lines) is the entire data-access layer: every query is a full-sheet read + in-memory filter/append via `sheets.spreadsheets.values.*`.

**Auth ([auth.ts](auth.ts))**: NextAuth v5 (beta) with a single Google provider requesting `spreadsheets` + `drive.file` scopes — login *is* the authorization to read/write the user's spreadsheet. The JWT callback stores `access_token`/`refresh_token`/`expires_at` and auto-refreshes the access token via the Google token endpoint when it's close to expiry; a failed refresh sets `token.error = "RefreshTokenError"`, which `middleware.ts` checks on every request to force re-login. Session lifetime is 180 days (few consent prompts).

**Route protection ([middleware.ts](middleware.ts))**: everything requires an authenticated session *except* `/login`, `/check`, `/api/auth`, and `/api/sheets/checkin` — these are the student-facing, unauthenticated check-in surface.

**Session lifecycle (the core domain concept)**: an admin "opens" a class session ([app/admin/session/[sessionId]](app/admin/session/%5BsessionId%5D)), which generates an OTP (`lib/otp.ts`) and GPS geofence (lat/lng/radius). Because the check-in endpoint is public/unauthenticated, it can't hold the admin's OAuth token in a cookie — instead `lib/session-store.ts` is an **in-process** `Map` that the admin's browser populates (via polling) with `sessionId → { spreadsheetId, accessToken, expiresAt }`, plus an `OTP → sessionId` index for manual-entry mode. This only works for single-instance deployments; a comment in that file flags it needs to become Redis/KV for multi-instance (e.g. Vercel serverless) hosting. Entries expire after 4 hours.

**Student check-in flow ([app/api/sheets/checkin/route.ts](app/api/sheets/checkin/route.ts))**: student hits `/check` (QR scan, carries `session_id`) or enters an OTP manually → resolves the session/access-token via `session-store.ts` → validates OTP/expiry/closed state → validates `student_id` is a 9-digit string (anti-injection) → computes GPS distance via `lib/haversine.ts` against the session's geofence → status is `present` / `late` / `gps_fail` based on distance and `late_after_min` (unless `late_enabled === false`) → duplicate check-ins for the same student+session return the existing record instead of writing a new one. Has a simple in-process IP rate limiter (10 req/min).

**Double periods**: a `Session` can span two periods (`period_count: 2`) with either `check_in_mode: "single"` (one check-in covers both periods) or `"double"` (two linked sessions, `linked_session_id` + `part_number` connect Part 1 ↔ Part 2). `lib/period-utils.ts` handles period-number ↔ time-label conversion (Thai labels, e.g. "คาบ 3–4 (11:00–14:30)"); periods are fixed 90-minute slots 1–6 starting 08:00.

**Semester/week model**: `SemesterConfig` (per course+section) defines `semester_start`, `total_weeks`, and a `teaching_schedule` (days of week + period). `lib/week-utils.ts` derives week numbers/labels (`W1`, `W2m`/`W2t`/... when multiple teaching days per week) from a session's date relative to `semester_start` — used to build the attendance grid in course summaries.

**Anti-cheating / conflict detection ([lib/conflict-detection.ts](lib/conflict-detection.ts))**: after check-ins are collected, `buildDeviceConflicts` union-finds attendance records into clusters that share a `device_fingerprint` (UA-based) or `device_fingerprint_gpu` (canvas/WebGL, survives incognito/browser switches on the same hardware) — these are "confirmed" duplicates. Records sharing only an IP + tight time/GPS proximity window are "possible" duplicates (campus WiFi can share one IP across many students). Surfaced in the admin session view for manual review/action (`approve` / `flag` / `mark_absent` / `revoke`).

**Audit trail**: attendance edits/overrides are tracked on the record itself (`edited_at/from/to`, `overridden`, `action_taken`) plus a separate `audit` log written through `app/api/sheets/audit/route.ts` for admin-driven changes (imports, manual entries, corrections).

**Route structure**: `app/admin/**` (authenticated teacher UI: course list, session control, past-entry correction, roster import via `lib/xlsx-parser.ts`, semester setup with a Leaflet GPS map picker, per-course summary grid, audit log), `app/check/**` (public student check-in), `app/projector/[sessionId]/**` (public/display-only live QR + roster view for classroom projection), `app/api/sheets/**` (all server routes wrapping `lib/sheets.ts`).
