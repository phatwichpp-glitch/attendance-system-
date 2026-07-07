"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { CheckInState } from "@/types";
import { useClock } from "@/lib/hooks/useClock";
import { calculateDistance } from "@/lib/haversine";

// Largest pairwise distance between GPS samples taken a few seconds apart. Real
// GPS fixes drift slightly even when stationary; a perfectly static reading
// combined with unrealistically high accuracy is a pattern seen with mock-location
// tools. This is a weak, best-effort heuristic — used server-side only to flag a
// check-in for teacher review, never to block it.
function computeJitterM(samples: { lat: number; lng: number }[]): number {
  let max = 0;
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      const d = calculateDistance(samples[i].lat, samples[i].lng, samples[j].lat, samples[j].lng);
      if (d > max) max = d;
    }
  }
  return Math.round(max);
}

// ── Fingerprint ──────────────────────────────────────────────────────────────
function djb2(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function generateFingerprint(): string {
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width + "x" + screen.height + "x" + screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.hardwareConcurrency?.toString() || "",
    navigator.platform || "",
  ];
  return djb2(components.join("|"));
}

function getOrCreateFingerprint(): string {
  if (typeof window === "undefined") return "";
  try {
    const KEY = "device_fp";
    const stored = localStorage.getItem(KEY);
    if (stored) return stored;
    const fp = generateFingerprint();
    localStorage.setItem(KEY, fp);
    return fp;
  } catch {
    return "";
  }
}

// GPU-level fingerprint: canvas render quirks + WebGL renderer/vendor strings.
// Unlike generateFingerprint() (UA-based), this is driven by the GPU/driver, so it
// stays the same across different browsers or incognito mode on the same physical
// device — closing the "switch browser to dodge the same-device check" loophole.
function generateGpuFingerprint(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 220;
    canvas.height = 30;

    let canvasStr = "";
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px Arial";
      ctx.fillStyle = "#f60";
      ctx.fillRect(0, 0, 100, 20);
      ctx.fillStyle = "#069";
      ctx.fillText("device-check αβγ", 2, 2);
      ctx.strokeStyle = "rgba(102, 204, 0, 0.7)";
      ctx.strokeRect(10, 10, 150, 10);
      canvasStr = canvas.toDataURL();
    }

    let glStr = "";
    const gl = (canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (gl) {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      if (dbg) {
        glStr = [
          gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL),
          gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL),
        ].join("|");
      }
    }

    if (!canvasStr && !glStr) return "";
    return djb2(canvasStr + "|" + glStr);
  } catch {
    return "";
  }
}

// ── API ──────────────────────────────────────────────────────────────────────
interface Result {
  status?: string;
  original_status?: string;
  student?: { firstname: string; lastname: string };
  checked_at?: string;
  distance_m?: number;
  gps_pass?: boolean;
  duplicate?: boolean;
  flagged?: boolean;
  error?: string;
}

const RETRY_DELAYS = [1000, 2000, 4000];
async function fetchCheckin(body: object, retries = 3): Promise<Response> {
  try {
    return await fetch("/api/sheets/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[RETRY_DELAYS.length - retries]));
      return fetchCheckin(body, retries - 1);
    }
    throw e;
  }
}

// In-app browsers (LINE especially, since check-in links are routinely shared
// in LINE chats/groups) frequently have broken or restricted Geolocation
// support in their embedded WebView — the permission prompt may never appear,
// or "Allow" silently does nothing. All of them expose their own "open in
// browser" option in their UI, which reliably works where a JS redirect
// wouldn't (most in-app browsers block/ignore those). Detecting this up front
// and pointing the student at that built-in escape hatch heads off the
// problem before they ever hit the GPS step.
function detectInAppBrowser(): string | null {
  const ua = navigator.userAgent;
  if (/\bLine\//i.test(ua)) return "LINE";
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return "Facebook";
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/BytedanceWebview|TikTok/i.test(ua)) return "TikTok";
  // Generic Android in-app WebView marker (e.g. other apps' embedded browsers
  // not named above) — still steer these into the same "open in browser" flow
  // rather than falling through to a bare denied/unavailable message.
  if (/; ?wv\)/i.test(ua)) return "แอปนี้";
  return null;
}

// ── Types ────────────────────────────────────────────────────────────────────
interface SessionInfo { courseId: string; period: string; section: string; }
// "denied" = user/browser explicitly refused permission (retry won't re-prompt,
// needs a manual settings change). "unavailable" = permission is fine but no
// fix could be obtained (weak signal, timeout) — retrying can genuinely help.
// "unsupported" = this browser/WebView has no Geolocation API at all.
type GpsStatus = "loading" | "ready" | "denied" | "unavailable" | "unsupported";
type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; name: string }
  | { status: "notfound" };

// ── CSS keyframes & pseudo-class overrides ───────────────────────────────────
const CSS = `
  @keyframes gpsPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
  @keyframes fadeInUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes spin { to{transform:rotate(360deg)} }
  ._ci-btn:active:not(:disabled) { transform: scale(0.98) !important; }
  ._ci-input:focus { border-color: #185FA5 !important; box-shadow: 0 0 0 3px rgba(24,95,165,0.12) !important; }
  * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
`;

// ── Static style objects ─────────────────────────────────────────────────────
const PAGE: React.CSSProperties = {
  minHeight: "100vh",
  backgroundColor: "#f9fafb",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "28px 16px 32px",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  WebkitTapHighlightColor: "transparent",
};
const INNER: React.CSSProperties = {
  width: "100%",
  maxWidth: 420,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};
const CARD: React.CSSProperties = {
  backgroundColor: "white",
  border: "0.5px solid rgba(0,0,0,0.12)",
  borderRadius: 16,
  padding: 24,
};
const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "#374151",
  marginBottom: 6,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};
const INPUT_BASE: React.CSSProperties = {
  width: "100%",
  border: "1.5px solid #d1d5db",
  borderRadius: 10,
  padding: "14px 16px",
  fontSize: 18,
  fontFamily: "ui-monospace, 'Cascadia Code', 'Courier New', monospace",
  letterSpacing: 3,
  textAlign: "center",
  outline: "none",
  backgroundColor: "white",
  color: "#111827",
  transition: "border-color 0.15s, box-shadow 0.15s",
  display: "block",
};
const INPUT_SUB: React.CSSProperties = {
  fontSize: 11,
  color: "#9ca3af",
  textAlign: "center",
  marginTop: 4,
};
const BTN: React.CSSProperties = {
  width: "100%",
  height: 52,
  borderRadius: 12,
  backgroundColor: "#185FA5",
  color: "white",
  fontSize: 16,
  fontWeight: 600,
  border: "none",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  marginTop: 20,
  transition: "background-color 0.15s, transform 0.1s",
};
const BTN_DISABLED: React.CSSProperties = {
  backgroundColor: "#d1d5db",
  cursor: "not-allowed",
};

function resultCard(variant: "green" | "amber" | "blue" | "red"): React.CSSProperties {
  const v = {
    green: ["#EAF3DE", "#97C459"],
    amber: ["#FAEEDA", "#EF9F27"],
    blue:  ["#E6F1FB", "#7AB8F5"],
    red:   ["#FCEBEB", "#F09595"],
  }[variant];
  return { ...CARD, backgroundColor: v[0], border: `1px solid ${v[1]}`, animation: "fadeInUp 0.3s ease" };
}

function rTitle(color: string): React.CSSProperties {
  return { fontSize: 22, fontWeight: 700, color, margin: "12px 0 0", textAlign: "center" };
}
const R_NAME: React.CSSProperties = { fontSize: 16, color: "#374151", margin: "6px 0 0", textAlign: "center" };
const R_TIME: React.CSSProperties = { fontSize: 14, fontFamily: "ui-monospace, monospace", color: "#6b7280", margin: "6px 0 0", textAlign: "center" };
const R_DIST: React.CSSProperties = { fontSize: 12, color: "#9ca3af", margin: "4px 0 0", textAlign: "center" };
const R_SUB:  React.CSSProperties = { fontSize: 13, color: "#6b7280", margin: "8px 0 0", textAlign: "center", lineHeight: 1.6 };

// ── Component ─────────────────────────────────────────────────────────────────
export default function CheckClient() {
  const sp = useSearchParams();
  const sessionId = sp.get("s") ?? "";
  const otp       = sp.get("o") ?? "";
  const sid       = sp.get("sid") ?? "";
  const isManual  = !sessionId && !otp;

  const [state, setState]             = useState<CheckInState>("loading");
  const [studentId, setStudentId]     = useState("");
  const [manualOtp, setManualOtp]     = useState("");
  const [gpsStatus, setGpsStatus]     = useState<GpsStatus>("loading");
  const [gpsCoords, setGpsCoords]     = useState<{ lat: number; lng: number } | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [showHelp, setShowHelp]       = useState(false);
  const [result, setResult]           = useState<Result | null>(null);
  const [session, setSession]         = useState<SessionInfo | null>(null);
  const [inAppBrowser, setInAppBrowser] = useState<string | null>(null);
  // Keyed by the input it was fetched for — stale results are ignored by
  // derivation instead of being cleared with a synchronous setState in an effect.
  const [previewResult, setPreviewResult] = useState<{ key: string; state: PreviewState } | null>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const fingerprintRef = useRef("");
  const gpuFingerprintRef = useRef("");
  const gpsSamplesRef = useRef<{ lat: number; lng: number; accuracy: number }[]>([]);
  const clock = useClock();

  const requestGps = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGpsStatus("unsupported");
      return;
    }
    setGpsStatus("loading");
    gpsSamplesRef.current = [];
    let settled = false;
    // Watch (not single-shot) so we can measure jitter between fixes — a real
    // GPS receiver drifts a little even standing still, a useful (soft) signal
    // against a fixed/mocked coordinate. Keeps reporting the most accurate fix
    // seen so far as soon as one arrives.
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        settled = true;
        gpsSamplesRef.current.push({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        const best = gpsSamplesRef.current.reduce((a, b) => (b.accuracy < a.accuracy ? b : a));
        setGpsCoords({ lat: best.lat, lng: best.lng });
        setGpsAccuracy(best.accuracy);
        setGpsStatus("ready");
      },
      (err) => {
        settled = true;
        // code 1 = PERMISSION_DENIED (needs a settings change); codes 2/3 =
        // POSITION_UNAVAILABLE/TIMEOUT (permission is fine, signal isn't —
        // showing "enable permission" instructions here would be actively
        // wrong and is exactly the kind of thing that reads as "I granted it
        // and it still doesn't work").
        setGpsStatus((s) => (s === "ready" ? s : err.code === 1 ? "denied" : "unavailable"));
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
    // Indoor/classroom GPS fixes routinely take 5-15s to lock (weak signal
    // through walls/roof) — the previous 3s cutoff killed the watch before a
    // real fix (or even the browser's own timeout error) had a chance to land,
    // leaving the UI stuck on "Getting Location..." forever with no error and
    // no way to retry. This is a safety net for WebViews that silently never
    // call either callback; the 1s margin over the request's own `timeout`
    // lets a normal timeout error fire and be handled above first.
    setTimeout(() => {
      navigator.geolocation.clearWatch(watchId);
      if (!settled) setGpsStatus((s) => (s === "loading" ? "unavailable" : s));
    }, 13000);
  }, []);

  useEffect(() => {
    fingerprintRef.current = getOrCreateFingerprint();
    gpuFingerprintRef.current = generateGpuFingerprint();
    setInAppBrowser(detectInAppBrowser());
    requestGps();

    if (isManual) { setState("ready"); return; }
    if (!sessionId || !otp) { setState("session_invalid"); return; }

    fetchCheckin({ session_id: sessionId, otp, spreadsheet_id: sid })
      .then((r) => r.json())
      .then((d) => {
        if (d.error === "session_expired") { setState("session_expired"); return; }
        if (d.valid) {
          if (d.session) setSession({ courseId: d.session.course_id, period: d.session.period, section: d.session.section });
          setState("ready");
        } else {
          setState("session_invalid");
        }
      })
      .catch(() => setState("session_invalid"));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally runs once on mount; sessionId/otp are URL params that don't change

  useEffect(() => {
    if (state === "ready") setTimeout(() => inputRef.current?.focus(), 100);
  }, [state]);

  // Name preview — once the ID (and OTP in manual mode) is complete, resolve the
  // student's name so they can confirm it's really them before submitting.
  // One mistyped digit that matches a classmate would otherwise check them in.
  const previewKey = `${studentId}|${isManual ? manualOtp : ""}`;
  const previewActive = /^\d{9}$/.test(studentId) && (!isManual || /^\d{6}$/.test(manualOtp)) && state === "ready";
  const preview: PreviewState =
    previewActive && previewResult?.key === previewKey ? previewResult.state : { status: "idle" };

  useEffect(() => {
    if (!previewActive) return;
    const key = previewKey;
    let cancelled = false;
    const t = setTimeout(async () => {
      setPreviewResult({ key, state: { status: "loading" } });
      try {
        const body = isManual
          ? { otp: manualOtp, student_id: studentId, preview: true }
          : { session_id: sessionId, otp, spreadsheet_id: sid, student_id: studentId, preview: true };
        const res = await fetch("/api/sheets/checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const d = await res.json();
        if (cancelled) return;
        if (res.ok && d.student) {
          setPreviewResult({ key, state: { status: "found", name: `${d.student.firstname} ${d.student.lastname}`.trim() } });
        } else if (res.status === 404 && d.error === "not_found") {
          setPreviewResult({ key, state: { status: "notfound" } });
        } else {
          setPreviewResult({ key, state: { status: "idle" } }); // network/session issues surface at submit instead
        }
      } catch {
        if (!cancelled) setPreviewResult({ key, state: { status: "idle" } });
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- previewKey encodes studentId+manualOtp
  }, [previewActive, previewKey, isManual, state, sessionId, otp, sid]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{9}$/.test(studentId)) return;
    if (isManual && !/^\d{6}$/.test(manualOtp)) return;
    setState("submitting");
    try {
      const samples = gpsSamplesRef.current;
      const locationSignals = {
        accuracy: gpsAccuracy ?? undefined,
        location_jitter_m: samples.length >= 2 ? computeJitterM(samples) : undefined,
        location_samples: samples.length,
      };
      const body = isManual
        ? { otp: manualOtp, student_id: studentId, lat: gpsCoords?.lat ?? null, lng: gpsCoords?.lng ?? null, device_fingerprint: fingerprintRef.current, device_fingerprint_gpu: gpuFingerprintRef.current, ...locationSignals }
        : { session_id: sessionId, otp, student_id: studentId, lat: gpsCoords?.lat ?? null, lng: gpsCoords?.lng ?? null, spreadsheet_id: sid, device_fingerprint: fingerprintRef.current, device_fingerprint_gpu: gpuFingerprintRef.current, ...locationSignals };

      const res  = await fetchCheckin(body);
      const data = await res.json() as Result;

      if (!res.ok) {
        if (data.error === "session_expired") { setState("session_expired"); return; }
        if (data.error && ["session_invalid", "session_not_found", "invalid_otp"].includes(data.error)) { setState("session_invalid"); return; }
        if (data.error === "not_found") { setState("not_found"); return; }
        if (data.error === "rate_limited") { setState("rate_limited"); return; }
        setState("error"); return;
      }

      setResult(data);
      if (data.duplicate) { setState(data.original_status === "gps_fail" ? "already_gps_fail" : "already_present"); return; }
      if (data.status === "gps_fail") { setState("gps_fail"); return; }
      setState(data.status === "late" ? "success_late" : "success_present");
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    } catch {
      setState("error");
    }
  };

  const reset = () => { setStudentId(""); setManualOtp(""); setResult(null); setState("ready"); };
  const fmt   = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) + " น.";

  // Header course line
  const isTerminal  = state === "session_invalid" || state === "session_expired";
  const headerText  = isTerminal ? "Session Closed" : session ? `${session.courseId} · Period ${session.period}` : isManual ? "Manual Check-In" : null;
  const headerColor = isTerminal ? "#A32D2D" : "#374151";

  const submitting  = state === "submitting";
  const canSubmit   = studentId.length === 9 && (!isManual || manualOtp.length === 6)
    && gpsStatus !== "loading" && preview.status !== "notfound" && preview.status !== "loading";

  return (
    <>
      <style>{CSS}</style>
      <div style={PAGE}>
        <div style={INNER}>

          {/* ── Header ─────────────────────────────────────────────────── */}
          <div style={{ marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Attendance
            </span>
            {headerText && (
              <p style={{ fontSize: 15, fontWeight: 600, color: headerColor, margin: "3px 0 0", textAlign: "center" }}>
                {headerText}
              </p>
            )}
            {clock.combined && (
              <p style={{ fontSize: 12, color: "#888", margin: "4px 0 0", textAlign: "center" }}>
                {clock.combined}
              </p>
            )}
          </div>

          {/* ── In-app browser warning ───────────────────────────────────── */}
          {inAppBrowser && (
            <div style={{
              backgroundColor: "#FAEEDA", border: "1px solid #EF9F27", borderRadius: 12,
              padding: "12px 14px", fontSize: 12, color: "#78350F", lineHeight: 1.6,
            }}>
              <strong>⚠ เปิดผ่านแอป {inAppBrowser} อยู่ — ระบบตำแหน่งอาจไม่ทำงาน</strong>
              <br />
              กดปุ่มเมนู (⋯ หรือจุดสามจุด) ที่มุมหน้าจอ แล้วเลือก &quot;เปิดด้วยเบราว์เซอร์&quot;
              หรือ &quot;Open in Browser&quot; เพื่อเปิดหน้านี้ใน Chrome/Safari แทน
            </div>
          )}

          {/* ── Loading (pre-check) ─────────────────────────────────────── */}
          {state === "loading" && (
            <div style={CARD}>
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <SpinEl size={32} />
                <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 14 }}>กำลังตรวจสอบคาบเรียน...</p>
              </div>
            </div>
          )}

          {/* ── Terminal: session invalid / expired ─────────────────────── */}
          {isTerminal && (
            <div style={resultCard("red")}>
              <ResultIcon type="x" color="#A32D2D" />
              <p style={rTitle("#A32D2D")}>Session Closed</p>
              <p style={R_SUB}>
                {state === "session_expired"
                  ? "คาบเรียนนี้ปิดแล้ว หรือรหัส OTP หมดอายุ"
                  : isManual ? "ไม่พบรหัส OTP นี้ หรือยังไม่มีคาบเรียนที่เปิดอยู่"
                  : "QR code อาจหมดอายุหรือไม่ถูกต้อง"}
              </p>
              <p style={{ ...R_SUB, marginTop: 4 }}>กรุณาติดต่ออาจารย์ผู้สอน</p>
              {isManual && <RetryBtn onClick={reset} />}
            </div>
          )}

          {/* ── Form (ready + submitting) ────────────────────────────────── */}
          {(state === "ready" || submitting) && (
            <div style={CARD}>
              {/* Manual mode badge */}
              {isManual && (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  backgroundColor: "#FAEEDA", border: "1px solid #EF9F27",
                  borderRadius: 20, padding: "4px 12px",
                  fontSize: 11, color: "#854F0B", fontWeight: 500, marginBottom: 18,
                }}>
                  ● Manual Check-In · กรอกรหัส OTP จากหน้าจอหน้าห้อง
                </div>
              )}

              {/* GPS status */}
              <GpsRow
                status={gpsStatus}
                accuracy={gpsAccuracy}
                showHelp={showHelp}
                onToggleHelp={() => setShowHelp((v) => !v)}
                onRetry={requestGps}
              />

              <form onSubmit={handleSubmit}>
                {/* Student ID */}
                <div style={{ marginBottom: 16 }}>
                  <label style={LABEL}>Student ID</label>
                  <input
                    ref={inputRef}
                    type="tel"
                    inputMode="numeric"
                    maxLength={9}
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value.replace(/\D/g, "").slice(0, 9))}
                    placeholder="กรอกรหัสนักศึกษา 9 หลัก"
                    className="_ci-input"
                    style={INPUT_BASE}
                    autoComplete="off"
                    disabled={submitting}
                  />
                  <p style={INPUT_SUB}>{studentId.length} / 9</p>

                  {/* Name confirmation — verify identity before submitting */}
                  {preview.status === "loading" && (
                    <p style={{ ...INPUT_SUB, marginTop: 8 }}>กำลังตรวจสอบรหัส...</p>
                  )}
                  {preview.status === "found" && (
                    <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, backgroundColor: "#EAF3DE", border: "1px solid #97C459", textAlign: "center", animation: "fadeInUp 0.2s ease" }}>
                      <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#3B6D11" }}>✓ {preview.name}</p>
                      <p style={{ margin: "3px 0 0", fontSize: 11, color: "#3B6D11" }}>ตรวจสอบว่าเป็นชื่อของคุณ แล้วกดเช็คชื่อ</p>
                    </div>
                  )}
                  {preview.status === "notfound" && (
                    <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, backgroundColor: "#FCEBEB", border: "1px solid #F09595", textAlign: "center", animation: "fadeInUp 0.2s ease" }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#A32D2D" }}>ไม่พบรหัสนี้ในรายวิชา</p>
                      <p style={{ margin: "3px 0 0", fontSize: 11, color: "#A32D2D" }}>ตรวจสอบรหัสนักศึกษาอีกครั้ง</p>
                    </div>
                  )}
                </div>

                {/* OTP — manual mode only */}
                {isManual && (
                  <div style={{ marginBottom: 16 }}>
                    <label style={LABEL}>OTP</label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={6}
                      value={manualOtp}
                      onChange={(e) => setManualOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="รหัส 6 หลักจากหน้าจอ"
                      className="_ci-input"
                      style={{ ...INPUT_BASE, fontSize: 22, letterSpacing: 8, padding: "16px" }}
                      autoComplete="off"
                      disabled={submitting}
                    />
                    <p style={INPUT_SUB}>{manualOtp.length} / 6</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!canSubmit || submitting}
                  className="_ci-btn"
                  style={{ ...BTN, ...(!canSubmit || submitting ? BTN_DISABLED : {}) }}
                >
                  {submitting ? <><SpinEl size={18} white /> Checking...</> : "Check In"}
                </button>
              </form>
            </div>
          )}

          {/* ── Success: Checked In ──────────────────────────────────────── */}
          {state === "success_present" && (
            <div style={resultCard("green")}>
              <ResultIcon type="check" color="#3B6D11" />
              <p style={rTitle("#3B6D11")}>Checked In ✓</p>
              {result?.student && <p style={R_NAME}>{result.student.firstname} {result.student.lastname}</p>}
              {result?.checked_at && <p style={R_TIME}>{fmt(result.checked_at)}</p>}
              {result?.distance_m !== undefined && (
                <p style={R_DIST}>📍 ห่างจากห้องเรียน {result.distance_m} เมตร</p>
              )}
              {result?.flagged && (
                <p style={{ ...R_SUB, fontSize: 12, color: "#854F0B", marginTop: 10 }}>
                  ระบบตรวจพบสัญญาณ GPS ที่ผิดปกติระหว่างเช็คชื่อ — กรุณาแจ้งอาจารย์ผู้สอนว่าระบบ GPS มีปัญหา
                </p>
              )}
            </div>
          )}

          {/* ── Success: Late ────────────────────────────────────────────── */}
          {state === "success_late" && (
            <div style={resultCard("amber")}>
              <ResultIcon type="clock" color="#854F0B" />
              <p style={rTitle("#854F0B")}>Checked In — Late</p>
              {result?.student && <p style={R_NAME}>{result.student.firstname} {result.student.lastname}</p>}
              {result?.checked_at && <p style={R_TIME}>{fmt(result.checked_at)}</p>}
              <p style={{ ...R_SUB, fontSize: 11, color: "#92400E", marginTop: 10 }}>
                เช็คชื่อหลังเวลาที่กำหนด — ระบบบันทึกสถานะเป็น &quot;สาย&quot;
              </p>
              {result?.flagged && (
                <p style={{ ...R_SUB, fontSize: 12, color: "#854F0B", marginTop: 6 }}>
                  ระบบตรวจพบสัญญาณ GPS ที่ผิดปกติระหว่างเช็คชื่อ — กรุณาแจ้งอาจารย์ผู้สอนว่าระบบ GPS มีปัญหา
                </p>
              )}
            </div>
          )}

          {/* ── GPS Fail ─────────────────────────────────────────────────── */}
          {state === "gps_fail" && (
            <div style={resultCard("amber")}>
              <ResultIcon type="location" color="#854F0B" />
              <p style={rTitle("#854F0B")}>GPS Not Verified</p>
              {result?.student && <p style={R_NAME}>{result.student.firstname} {result.student.lastname}</p>}
              <p style={{ ...R_SUB, color: "#92400E" }}>
                ระบบบันทึกการเช็คชื่อไว้แล้ว แต่ตำแหน่ง GPS ของคุณอยู่นอกรัศมีห้องเรียน
              </p>
              <p style={{ ...R_SUB, color: "#92400E" }}>
                กรุณาแจ้งอาจารย์ผู้สอนเพื่อยืนยันการเข้าเรียน
              </p>
              {result?.distance_m !== undefined && (
                <p style={{ ...R_DIST, color: "#854F0B", fontWeight: 600, marginTop: 8 }}>
                  คุณอยู่ห่างจากห้องเรียน {result.distance_m} เมตร — ลองเดินเข้าใกล้ห้องเรียนแล้วให้อาจารย์ตรวจสอบอีกครั้ง
                </p>
              )}
            </div>
          )}

          {/* ── Rate Limited ─────────────────────────────────────────────── */}
          {state === "rate_limited" && (
            <div style={resultCard("amber")}>
              <ResultIcon type="clock" color="#854F0B" />
              <p style={rTitle("#854F0B")}>กรุณารอสักครู่</p>
              <p style={{ ...R_SUB, color: "#92400E" }}>
                ระบบกำลังมีคนเช็คชื่อพร้อมกันจำนวนมาก — รอสักครู่แล้วลองใหม่อีกครั้ง
              </p>
              <button onClick={reset} className="_ci-btn" style={{ ...BTN, marginTop: 12 }}>
                ลองอีกครั้ง
              </button>
            </div>
          )}

          {/* ── Already Checked In ──────────────────────────────────────── */}
          {state === "already_present" && (
            <div style={resultCard("blue")}>
              <ResultIcon type="info" color="#185FA5" />
              <p style={rTitle("#185FA5")}>Already Checked In</p>
              {result?.student && <p style={R_NAME}>{result.student.firstname} {result.student.lastname}</p>}
              {result?.checked_at && (
                <p style={{ ...R_SUB, color: "#1e3a5f" }}>
                  คุณเช็คชื่อคาบนี้ไปแล้วเมื่อ {fmt(result.checked_at)}
                </p>
              )}
            </div>
          )}

          {/* ── Already Checked In — GPS Fail ───────────────────────────── */}
          {state === "already_gps_fail" && (
            <div style={resultCard("amber")}>
              <ResultIcon type="info" color="#854F0B" />
              <p style={rTitle("#854F0B")}>Already Checked In — รอตรวจสอบ</p>
              {result?.student && <p style={R_NAME}>{result.student.firstname} {result.student.lastname}</p>}
              <p style={{ ...R_SUB, color: "#92400E" }}>
                บันทึกไว้แล้ว — รออาจารย์ตรวจสอบกรณีตำแหน่ง GPS ไม่ผ่าน
              </p>
            </div>
          )}

          {/* ── Not Found ────────────────────────────────────────────────── */}
          {state === "not_found" && (
            <div style={resultCard("red")}>
              <ResultIcon type="user" color="#A32D2D" />
              <p style={rTitle("#A32D2D")}>Student Not Found</p>
              <p style={{ ...R_SUB, color: "#7f1d1d" }}>
                รหัส <span style={{ fontFamily: "monospace" }}>{studentId}</span> ไม่อยู่ในรายชื่อวิชานี้
              </p>
              <p style={{ ...R_SUB, color: "#7f1d1d", marginTop: 4 }}>
                ตรวจสอบรหัสอีกครั้ง หรือติดต่ออาจารย์ผู้สอน
              </p>
              <RetryBtn onClick={reset} />
            </div>
          )}

          {/* ── Generic Error ────────────────────────────────────────────── */}
          {state === "error" && (
            <div style={resultCard("red")}>
              <ResultIcon type="x" color="#A32D2D" />
              <p style={rTitle("#A32D2D")}>Error</p>
              <p style={{ ...R_SUB, color: "#7f1d1d" }}>กรุณาลองใหม่อีกครั้ง</p>
              <RetryBtn onClick={reset} />
            </div>
          )}

          {/* ── Footer ─────────────────────────────────────────────────── */}
          {(session || isManual) && (
            <p style={{ textAlign: "center", fontSize: 10, color: "#9ca3af", letterSpacing: "0.04em", margin: 0 }}>
              Attendance System{session ? ` · ${session.courseId} · Sec.${session.section}` : ""}
            </p>
          )}

        </div>
      </div>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function GpsRow({ status, accuracy, showHelp, onToggleHelp, onRetry }: {
  status: GpsStatus;
  accuracy: number | null;
  showHelp: boolean;
  onToggleHelp: () => void;
  onRetry: () => void;
}) {
  const cfg = {
    loading:     { dot: "#854F0B", bg: "#fffbeb", label: "Getting Location...", sub: "\u0e23\u0e2d\u0e2a\u0e31\u0e01\u0e04\u0e23\u0e39\u0e48 \u0e23\u0e30\u0e1a\u0e1a\u0e01\u0e33\u0e25\u0e31\u0e07\u0e23\u0e30\u0e1a\u0e38\u0e15\u0e33\u0e41\u0e2b\u0e19\u0e48\u0e07\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13 (\u0e43\u0e19\u0e2d\u0e32\u0e04\u0e32\u0e23\u0e2d\u0e32\u0e08\u0e43\u0e0a\u0e49\u0e40\u0e27\u0e25\u0e32\u0e16\u0e36\u0e07 10-15 \u0e27\u0e34\u0e19\u0e32\u0e17\u0e35)", pulse: true },
    ready:       { dot: "#3B6D11", bg: "#f0fdf4", label: `Location Ready${accuracy ? `  \u00b1${Math.round(accuracy)} m` : ""}`, sub: "\u0e1e\u0e23\u0e49\u0e2d\u0e21\u0e40\u0e0a\u0e47\u0e04\u0e0a\u0e37\u0e48\u0e2d", pulse: false },
    denied:      { dot: "#A32D2D", bg: "#fff1f1", label: "Location Denied", sub: "\u0e01\u0e23\u0e38\u0e13\u0e32\u0e2d\u0e19\u0e38\u0e0d\u0e32\u0e15 Location \u0e43\u0e19\u0e01\u0e32\u0e23\u0e15\u0e31\u0e49\u0e07\u0e04\u0e48\u0e32\u0e40\u0e1a\u0e23\u0e32\u0e27\u0e4c\u0e40\u0e0b\u0e2d\u0e23\u0e4c", pulse: false },
    unavailable: { dot: "#854F0B", bg: "#fffbeb", label: "Location Unavailable", sub: "\u0e2b\u0e32\u0e15\u0e33\u0e41\u0e2b\u0e19\u0e48\u0e07\u0e44\u0e21\u0e48\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08 \u2014 \u0e2a\u0e31\u0e0d\u0e0d\u0e32\u0e13 GPS \u0e2d\u0e48\u0e2d\u0e19\u0e2b\u0e23\u0e37\u0e2d\u0e43\u0e0a\u0e49\u0e40\u0e27\u0e25\u0e32\u0e19\u0e32\u0e19\u0e40\u0e01\u0e34\u0e19\u0e44\u0e1b \u0e25\u0e2d\u0e07\u0e02\u0e22\u0e31\u0e1a\u0e44\u0e1b\u0e43\u0e01\u0e25\u0e49\u0e2b\u0e19\u0e49\u0e32\u0e15\u0e48\u0e32\u0e07\u0e41\u0e25\u0e49\u0e27\u0e25\u0e2d\u0e07\u0e43\u0e2b\u0e21\u0e48", pulse: false },
    unsupported: { dot: "#854F0B", bg: "#fffbeb", label: "Location Not Supported", sub: "\u0e40\u0e1a\u0e23\u0e32\u0e27\u0e4c\u0e40\u0e0b\u0e2d\u0e23\u0e4c\u0e19\u0e35\u0e49\u0e44\u0e21\u0e48\u0e23\u0e2d\u0e07\u0e23\u0e31\u0e1a\u0e01\u0e32\u0e23\u0e23\u0e30\u0e1a\u0e38\u0e15\u0e33\u0e41\u0e2b\u0e19\u0e48\u0e07 \u2014 \u0e25\u0e2d\u0e07\u0e40\u0e1b\u0e34\u0e14\u0e25\u0e34\u0e07\u0e01\u0e4c\u0e19\u0e35\u0e49\u0e43\u0e19 Chrome \u0e2b\u0e23\u0e37\u0e2d Safari \u0e41\u0e17\u0e19", pulse: false },
  }[status];

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: 10, backgroundColor: cfg.bg }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          backgroundColor: cfg.dot, flexShrink: 0, marginTop: 5,
          animation: cfg.pulse ? "gpsPulse 1.2s ease-in-out infinite" : undefined,
        }} />
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: cfg.dot, margin: 0 }}>{cfg.label}</p>
          <p style={{ fontSize: 11, color: "#6b7280", margin: "3px 0 0", lineHeight: 1.5 }}>{cfg.sub}</p>
          {status === "denied" && (
            <>
              <button
                onClick={onToggleHelp}
                style={{ fontSize: 11, color: "#185FA5", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 6, display: "block" }}
              >
                วิธีเปิดสิทธิ์เข้าถึงตำแหน่ง →
              </button>
              {showHelp && (
                <div style={{ marginTop: 8, padding: "10px 12px", backgroundColor: "white", borderRadius: 8, border: "0.5px solid #e5e7eb", fontSize: 11, color: "#374151", lineHeight: 1.7 }}>
                  <strong>ถ้ากด &quot;อนุญาต&quot; ไปแล้วแต่ยังขึ้น Denied (มักเจอใน iPhone):</strong><br />
                  บนไอโฟนมีสิทธิ์ 2 ชั้นที่ต้องเปิดพร้อมกัน — กด &quot;อนุญาต&quot; แค่ตอนเบราว์เซอร์ถามครั้งแรกอาจไม่พอ<br />
                  <strong>1. เช็คสิทธิ์รวมทั้งเครื่อง:</strong> ตั้งค่า → ความเป็นส่วนตัวและความปลอดภัย → บริการหาตำแหน่ง
                  → เปิดสวิตช์บนสุด แล้วเลื่อนหา Safari (หรือเบราว์เซอร์ที่ใช้) → ตั้งเป็น &quot;ขณะใช้แอป&quot;<br />
                  <strong>2. เช็คสิทธิ์เฉพาะเว็บนี้:</strong> กดไอคอน &quot;aA&quot; ที่มุมซ้ายแถบที่อยู่ (ตอนเปิดหน้านี้ค้างอยู่)
                  → การตั้งค่าเว็บไซต์ → ตำแหน่ง → อนุญาต — ขั้นตอนนี้จะ<strong>ทับค่าจากข้อ 1</strong> ถ้าเคยกดปฏิเสธเว็บนี้ไว้ก่อน<br />
                  <strong>3. ถ้าเปิดในโหมดส่วนตัว (Private)</strong> ให้ลองเปิดลิงก์นี้ในแท็บปกติแทน<br />
                  แก้เสร็จแล้วต้อง<strong>โหลดหน้านี้ใหม่</strong> (กดปุ่มด้านล่าง) ไม่ใช่แค่กด Try Again เฉยๆ ถึงจะอ่านสิทธิ์ใหม่
                </div>
              )}
              <button
                onClick={() => window.location.reload()}
                style={{ fontSize: 11, color: "#374151", background: "white", border: "0.5px solid #d1d5db", borderRadius: 6, cursor: "pointer", padding: "5px 12px", marginTop: 8, display: "block" }}
              >
                โหลดหน้านี้ใหม่
              </button>
            </>
          )}
          {status === "unavailable" && (
            <button
              onClick={onRetry}
              style={{ fontSize: 11, color: "#374151", background: "white", border: "0.5px solid #d1d5db", borderRadius: 6, cursor: "pointer", padding: "5px 12px", marginTop: 8, display: "block" }}
            >
              ลองใหม่
            </button>
          )}
          {(status === "denied" || status === "unavailable" || status === "unsupported") && (
            <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 8, lineHeight: 1.5 }}>
              กดเช็คชื่อต่อได้เลย — ระบบจะบันทึกไว้ให้อาจารย์ตรวจสอบภายหลังหากไม่มีพิกัด
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

type IconType = "check" | "x" | "clock" | "location" | "info" | "user";
const ICON_PATHS: Record<IconType, string> = {
  check:    "M5 13l4 4L19 7",
  x:        "M6 18L18 6M6 6l12 12",
  clock:    "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  location: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z",
  info:     "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  user:     "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
};

function ResultIcon({ type, color }: { type: IconType; color: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
      <div style={{
        width: 56, height: 56, borderRadius: "50%",
        backgroundColor: `${color}18`, border: `2px solid ${color}35`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width={28} height={28} fill="none" stroke={color} strokeWidth={type === "check" ? 2.5 : 2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS[type]} />
        </svg>
      </div>
    </div>
  );
}

function SpinEl({ size = 28, white = false }: { size?: number; white?: boolean }) {
  return (
    <div style={{
      width: size, height: size,
      border: `${size > 20 ? 3 : 2}px solid ${white ? "rgba(255,255,255,0.3)" : "#e5e7eb"}`,
      borderTopColor: white ? "white" : "#185FA5",
      borderRadius: "50%",
      animation: "spin 0.8s linear infinite",
      flexShrink: 0,
    }} />
  );
}

function RetryBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "block", margin: "16px auto 0",
        padding: "10px 28px", borderRadius: 10,
        border: "0.5px solid rgba(0,0,0,0.15)",
        backgroundColor: "white", fontSize: 13, fontWeight: 500,
        color: "#374151", cursor: "pointer",
      }}
    >
      Try Again
    </button>
  );
}
